// Store контракты: әр жағдай MemoryStore-да ЖӘНЕ PrismaStore-да (уақытша SQLite файлы) бірдей орындалады.
import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";
import { migrateLibsql } from "../../lib/server/libsqlMigrate.ts";
import { MemoryStore } from "../../lib/server/store/memory.ts";
import { PrismaStore } from "../../lib/server/store/prisma.ts";
import { ConflictError, isConflict, type Store } from "../../lib/server/store/types.ts";

const dir = mkdtempSync(join(tmpdir(), "debug-store-"));
const url = `file:${join(dir, "contract.db")}`;
execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
const prisma = new PrismaClient({ datasourceUrl: url });
// Үшінші нұсқа: Turso-дағыдай libSQL адаптері арқылы (жергілікті libSQL файлы, миграциялар — біздің runner)
const libsqlUrl = `file:${join(dir, "libsql.db")}`;
const migrator = createClient({ url: libsqlUrl });
await migrateLibsql(migrator);
migrator.close();
const prismaLibsql = new PrismaClient({ adapter: new PrismaLibSQL({ url: libsqlUrl }) });
after(async () => {
  await prisma.$disconnect();
  await prismaLibsql.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const user = (email: string, extra: Record<string, unknown> = {}) => ({
  email, password_hash: "scrypt$x", role: "student" as const, last_name: "Тегі", first_name: "Аты", full_name: "Тегі Аты",
  university: "Мок университеті", course: "2 курс", phone: null, ...extra,
});
const rounds = [
  { idx: 1, kind: "mcq" as const, title: "Trace", duration_min: 20, status: "pending" as const, started_at: null, ends_at: null },
  { idx: 2, kind: "debug" as const, title: "Debug", duration_min: 30, status: "pending" as const, started_at: null, ends_at: null },
];
const contest = (slug: string) => ({ slug, title: "Т", starts_at: "2026-11-01T10:00:00.000Z", status: "draft" as const, board_locked: false, board_autolock_min: 10 });
const task = (round_id: string, idx: number, variant: "A" | "B" | null = null) => ({
  round_id, idx, title: `t${idx}`, statement: "", points: 1, options: [{ key: "a", text: "1" }], correct: "a", starter_code: null, solution_code: null,
  variant, image_url: null, entry: null, max_changed_lines: null, forbidden: ["set("], ai_refs: [], tests_public: [{ args: [[1]], expected: "1" }], tests_hidden: [],
});

for (const [name, make] of [["MemoryStore", () => new MemoryStore()], ["PrismaStore (SQLite)", () => new PrismaStore(prisma)], ["PrismaStore (libSQL адаптері)", () => new PrismaStore(prismaLibsql)]] as [string, () => Store][]) {
  describe(name, () => {
    let s: Store;
    before(async () => {
      s = make();
      await s.reset();
    });

    test("users: email кіші әріппен, қайталанса ConflictError, хэш тек userByEmail-де", async () => {
      const u = await s.createUser(user("Aidos@Mock.Test", { full_name: "Серіков Айдос", first_login_at: "2026-10-20T00:00:00.000Z" }));
      assert.equal(u.email, "aidos@mock.test");
      assert.ok(!("password_hash" in u));
      await assert.rejects(s.createUser(user("aidos@mock.test")), (e) => isConflict(e));
      assert.equal((await s.userByEmail("AIDOS@mock.test"))?.password_hash, "scrypt$x");
      await s.updateUser(u.id, { last_login_at: "2026-10-20T00:00:00.000Z" });
      assert.equal((await s.userById(u.id))?.last_login_at, "2026-10-20T00:00:00.000Z");
    });

    test("студенттер: ең жаңасы бірінші, кирилл регистрсіз іздеу, әкімші есептелмейді", async () => {
      await s.createUser(user("b@mock.test", { full_name: "Қайрат Бота", first_login_at: "2026-10-21T00:00:00.000Z" }));
      await s.createUser(user("admin@mock.test", { role: "admin", full_name: "Әкімші" }));
      assert.equal(await s.countStudents(), 2);
      assert.deepEqual((await s.listStudents({ order: "newest" })).map((u) => u.full_name)[0], "Қайрат Бота");
      assert.deepEqual((await s.listStudents({ order: "name", nameLike: "СЕРІК", limit: 8 })).map((u) => u.full_name), ["Серіков Айдос"]);
      assert.equal((await s.listStudents({ order: "name", nameLike: "Әкімші" })).length, 0);
    });

    test("reset токені бір рет қана алынады", async () => {
      const u = (await s.userByEmail("b@mock.test"))!;
      await s.addResetToken({ token_hash: "h1", user_id: u.id, expires_at: "2099-01-01T00:00:00.000Z" });
      assert.equal((await s.takeResetToken("h1"))?.user_id, u.id);
      assert.equal(await s.takeResetToken("h1"), null);
    });

    test("жарыс кезеңдерімен бірге құрылады; slug қайталанса ConflictError; жаңарту", async () => {
      const c = await s.createContest(contest("2026-11"), rounds);
      await assert.rejects(s.createContest(contest("2026-11"), rounds), (e) => isConflict(e));
      const rs = await s.listRounds(c.id);
      assert.deepEqual(rs.map((r) => [r.idx, r.kind, r.status]), [[1, "mcq", "pending"], [2, "debug", "pending"]]);
      assert.equal((await s.updateContest(c.id, { status: "published", board_locked: true }))?.board_locked, true);
      assert.equal(await s.updateContest("00000000-0000-4000-8000-000000000000", { title: "x" }), null);
      await s.updateRounds([{ id: rs[0].id, patch: { status: "closed" } }, { id: rs[1].id, patch: { status: "running", started_at: "a", ends_at: "b" } }]);
      assert.deepEqual((await s.listRounds(c.id)).map((r) => r.status), ["closed", "running"]);
    });

    test("тапсырмалар: JSON өрістер сақталады; (кезең, нөмір, нұсқа) — null нұсқа да бірегей", async () => {
      const [c] = await s.listContests();
      const [r1] = await s.listRounds(c.id);
      const t = await s.createTask(task(r1.id, 1));
      assert.deepEqual([t.forbidden, t.options, t.tests_public], [["set("], [{ key: "a", text: "1" }], [{ args: [[1]], expected: "1" }]]);
      await assert.rejects(s.createTask(task(r1.id, 1)), (e) => isConflict(e));
      await s.createTask(task(r1.id, 1, "A"));
      const t2 = await s.createTask(task(r1.id, 2));
      await assert.rejects(s.updateTask(t2.id, { idx: 1 }), (e) => isConflict(e));
      assert.equal((await s.getTask(t2.id))?.idx, 2);
      assert.equal((await s.updateTask(t2.id, { options: null, title: "жаңа" }))?.options, null);
      assert.deepEqual((await s.listTasks([r1.id])).map((x) => [x.idx, x.variant]), [[1, null], [1, "A"], [2, null]]);
      assert.equal(await s.deleteTask(t2.id), true);
      assert.equal(await s.deleteTask(t2.id), false);
    });

    test("ұзарту upsert, нұсқа — бірінші жазба жеңеді, жіберілімдер реті, бақылау upsert", async () => {
      const [c] = await s.listContests();
      const [r1] = await s.listRounds(c.id);
      const u = (await s.userByEmail("b@mock.test"))!;
      await s.setExtension({ round_id: r1.id, student_id: u.id, extra_min: 5 });
      await s.setExtension({ round_id: r1.id, student_id: u.id, extra_min: 10 });
      assert.deepEqual((await s.listExtensions([r1.id])).map((e) => e.extra_min), [10]);
      assert.equal((await s.addVariantIfAbsent({ contest_id: c.id, student_id: u.id, variant: "B" })).variant, "B");
      assert.equal((await s.addVariantIfAbsent({ contest_id: c.id, student_id: u.id, variant: "A" })).variant, "B");
      assert.equal(await s.countVariants(c.id), 1);
      const base = { contest_id: c.id, round_id: r1.id, task_id: "t", student_id: u.id, answer: "a", code: null, is_correct: true, points: 1, reason: null };
      await s.addSubmission({ ...base, created_at: "2026-10-20T10:00:02.000Z" });
      await s.addSubmission({ ...base, answer: "b", created_at: "2026-10-20T10:00:01.000Z" });
      assert.deepEqual((await s.listSubmissions({ contestId: c.id })).map((x) => x.answer), ["b", "a"]);
      assert.equal(await s.countSubmissions(c.id), 2);
      assert.equal((await s.listSubmissions({ studentIds: ["nobody"] })).length, 0);
      await s.upsertActivity({ round_id: r1.id, student_id: u.id, contest_id: c.id, data: { blur_count: 1 }, updated_at: "x" });
      await s.upsertActivity({ round_id: r1.id, student_id: u.id, contest_id: c.id, data: { blur_count: 2 }, updated_at: "y" });
      assert.deepEqual((await s.listActivity(c.id)).map((a) => a.data), [{ blur_count: 2 }]);
    });

    test("суреттер байт-байтымен қайтады", async () => {
      await s.addImage({ id: "11111111-1111-4111-8111-111111111111", mime: "image/png", data: new Uint8Array([137, 80, 78, 71]), created_at: "x" });
      const img = await s.getImage("11111111-1111-4111-8111-111111111111");
      assert.deepEqual([img?.mime, [...(img?.data ?? [])]], ["image/png", [137, 80, 78, 71]]);
      assert.equal(await s.getImage("nope"), null);
    });

    test("тест ілмектері: dump хэшсіз, patch, seed кестені алмастырады, reset", async () => {
      const d = await s.dump();
      assert.ok(d.users.length >= 2 && !JSON.stringify(d.users).includes("password_hash"));
      const [c] = d.contests as { id: string }[];
      await s.patch("contests", c.id, { title: "Патч" });
      assert.equal((await s.getContest(c.id))?.title, "Патч");
      await s.reset();
      assert.equal((await s.listContests()).length, 0);
      assert.equal(await s.countStudents(), 0);
    });
  });
}

test("isConflict: басқа модуль көшірмесінен келген қате де танылады (B60-5)", () => {
  const foreign = Object.assign(new Error("x"), { name: "ConflictError" });
  assert.equal(isConflict(foreign), true);
  assert.equal(isConflict(new ConflictError("x")), true);
  assert.equal(isConflict(new Error("x")), false);
});

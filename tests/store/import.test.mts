// Бұрынғы SQLite/Turso дерегін PostgreSQL-ге көшіру (#66): бұрынғы схемадағы SQLite файлы → бос Postgres схемасы,
// сосын PrismaStore арқылы оқып, көзбен салыстырамыз. Бос емес мақсат, транзакция, JSON экспорт, Turso жауабы.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { PrismaStore } from "../../lib/server/store/prisma.ts";
import { countSnapshot, countTarget, importSnapshot, readJsonFile, readSqliteFile, readTurso, toJson, type Snapshot } from "../../lib/server/importData.ts";
import { dropSchema, freshSchema } from "../pgSchema.mts";

const dir = mkdtempSync(join(tmpdir(), "debug-import-"));
const sqlitePath = join(dir, "legacy.db");
const urls: string[] = [];
const clients: PrismaClient[] = [];
function target() {
  const url = freshSchema("import");
  urls.push(url);
  const db = new PrismaClient({ datasourceUrl: url });
  clients.push(db);
  return db;
}
after(async () => {
  for (const c of clients) await c.$disconnect();
  for (const u of urls) await dropSchema(u);
  rmSync(dir, { recursive: true, force: true });
});

const U1 = "b1000000-0000-4000-8000-000000000001", U2 = "b2000000-0000-4000-8000-000000000002";
const C = "10000000-0000-4000-8000-000000000001", R1 = "20000000-0000-4000-8000-000000000001", R3 = "20000000-0000-4000-8000-000000000003";
const T1 = "30000000-0000-4000-8000-000000000001", T3 = "30000000-0000-4000-8000-000000000003";
const IMG = "11111111-1111-4111-8111-111111111111";

/** Бұрынғы Prisma/SQLite схемасы (tests/fixtures) + Prisma SQLite-те сақтайтын түрлер: boolean 0/1, Json мәтін, BLOB. */
function legacyDb() {
  const db = new DatabaseSync(sqlitePath);
  db.exec(readFileSync(new URL("../fixtures/legacy-sqlite-schema.sql", import.meta.url), "utf8"));
  const ins = (t: string, row: Record<string, unknown>) =>
    db.prepare(`INSERT INTO "${t}" (${Object.keys(row).map((k) => `"${k}"`).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")})`).run(...(Object.values(row) as never[]));
  const at = "2026-10-20T10:00:00.000Z";
  ins("users", { id: U1, email: "s1@mock.test", password_hash: "scrypt$16384$8$1$a$b", role: "student", last_name: "Серіков", first_name: "Айдос", full_name: "Серіков Айдос", university: "Мок университеті", course: "2 курс", phone: "+77010000001", first_login_at: at, last_login_at: at });
  ins("users", { id: U2, email: "admin@mock.test", password_hash: "scrypt$x", role: "admin", last_name: "", first_name: "", full_name: "Әкімші", university: "", course: null, phone: null, first_login_at: at, last_login_at: at });
  ins("reset_tokens", { token_hash: "h1", user_id: U1, expires_at: "2099-01-01T00:00:00.000Z" });
  ins("contests", { id: C, slug: "students-1", title: "DEBUG · Студенттер", starts_at: at, status: "published", board_locked: 1, board_autolock_min: 10 });
  ins("rounds", { id: R1, contest_id: C, idx: 1, kind: "mcq", title: "Trace — кодты оқу", duration_min: 20, status: "closed", started_at: at, ends_at: at });
  ins("rounds", { id: R3, contest_id: C, idx: 3, kind: "code", title: "Build", duration_min: 20, status: "pending", started_at: null, ends_at: null });
  ins("tasks", { id: T1, round_id: R1, idx: 1, title: "Қай сан?", statement: "```python\nprint(2 ** 3)\n```", points: 1, options: JSON.stringify([{ key: "a", text: "8" }, { key: "b", text: "6" }]), correct: "a", starter_code: null, solution_code: null, variant: null, image_url: `/api/images/${IMG}`, entry: null, max_changed_lines: null, forbidden: "[]", ai_refs: "[]", tests_public: "[]", tests_hidden: "[]" });
  ins("tasks", { id: T3, round_id: R3, idx: 15, title: "Бірегейлер", statement: "", points: 4, options: null, correct: null, starter_code: "def g(a):\n    pass\n", solution_code: "def g(a):\n    return len(set(a))\n", variant: "A", image_url: null, entry: "g", max_changed_lines: null, forbidden: JSON.stringify(["set("]), ai_refs: JSON.stringify(["def g(a): return len(set(a))"]), tests_public: JSON.stringify([{ args: [[1, 1]], expected: "1" }]), tests_hidden: JSON.stringify([{ args: [[]], expected: "0" }]) });
  ins("submissions", { id: 7, contest_id: C, round_id: R1, task_id: T1, student_id: U1, answer: "a", code: null, is_correct: 1, points: 1, reason: null, created_at: at });
  ins("submissions", { id: 9, contest_id: C, round_id: R3, task_id: T3, student_id: U1, answer: null, code: "def g(a):\n    return 0\n", is_correct: 0, points: 0, reason: "hidden", created_at: "2026-10-20T10:05:00.000Z" });
  ins("extensions", { round_id: R1, student_id: U1, extra_min: 5 });
  ins("variants", { contest_id: C, student_id: U1, variant: "A" });
  ins("activity", { round_id: R3, student_id: U1, contest_id: C, data: JSON.stringify({ blur_count: 2, keys: 140 }), updated_at: at });
  ins("task_images", { id: IMG, mime: "image/png", data: new Uint8Array([137, 80, 78, 71, 0, 255]), created_at: at });
  db.close();
}

describe("Turso/SQLite → PostgreSQL көшіру", () => {
  let snap: Snapshot;
  before(async () => {
    legacyDb();
    snap = await readSqliteFile(sqlitePath);
  });

  test("I66-1: барлық кесте түрлерімен бірге көшеді (кирилл, JSON, null нұсқа, boolean, байттар)", async () => {
    const db = target();
    const counts = await importSnapshot(db, snap);
    assert.deepEqual(counts, countSnapshot(snap));
    assert.deepEqual(counts, { users: 2, reset_tokens: 1, contests: 1, rounds: 2, tasks: 2, submissions: 2, extensions: 1, variants: 1, activity: 1, task_images: 1 });
    const s = new PrismaStore(db);
    assert.equal((await s.userByEmail("s1@mock.test"))?.password_hash, "scrypt$16384$8$1$a$b");
    assert.equal((await s.userByEmail("admin@mock.test"))?.role, "admin");
    const [c] = await s.listContests();
    assert.deepEqual([c.title, c.board_locked, c.board_autolock_min], ["DEBUG · Студенттер", true, 10]);
    const tasks = await s.listTasks([R1, R3]);
    const t1 = tasks.find((t) => t.id === T1)!, t3 = tasks.find((t) => t.id === T3)!;
    assert.deepEqual([t1.variant, t1.options, t1.statement], [null, [{ key: "a", text: "8" }, { key: "b", text: "6" }], "```python\nprint(2 ** 3)\n```"]);
    assert.deepEqual([t3.options, t3.forbidden, t3.tests_hidden, t3.variant], [null, ["set("], [{ args: [[]], expected: "0" }], "A"]);
    const subs = await s.listSubmissions({ contestId: C });
    assert.deepEqual(subs.map((x) => [x.id, x.is_correct, x.points]), [[7, true, 1], [9, false, 0]]);
    assert.deepEqual((await s.listActivity(C)).map((a) => a.data), [{ blur_count: 2, keys: 140 }]);
    assert.deepEqual((await s.listExtensions([R1])).map((e) => e.extra_min), [5]);
    assert.equal((await s.getVariant(C, U1))?.variant, "A");
    assert.deepEqual([...((await s.getImage(IMG))?.data ?? [])], [137, 80, 78, 71, 0, 255]);
    assert.equal((await s.takeResetToken("h1"))?.user_id, U1);
  });

  test("I66-2: көшірілген id-лерден кейін жаңа жіберілім ең үлкен id-ден әрі сақталады", async () => {
    const db = target();
    await importSnapshot(db, snap);
    const next = await new PrismaStore(db).addSubmission({ contest_id: C, round_id: R1, task_id: T1, student_id: U1, answer: "b", code: null, is_correct: false, points: 0, reason: null });
    assert.equal(next.id, 10);
  });

  test("I66-3: бос емес мақсатқа жазбайды, ештеңе өзгермейді", async () => {
    const db = target();
    await importSnapshot(db, snap);
    const before = await countTarget(db);
    await assert.rejects(importSnapshot(db, snap), /бос емес \(users, reset_tokens, contests/);
    assert.deepEqual(await countTarget(db), before);
  });

  test("I66-4: JSON экспорт → импорт бірдей деректі береді (байттар base64 арқылы)", async () => {
    const file = join(dir, "export.json");
    writeFileSync(file, toJson(snap));
    const back = readJsonFile(file);
    assert.deepEqual(countSnapshot(back), countSnapshot(snap));
    assert.deepEqual(back.task_images[0].data, snap.task_images[0].data);
    const db = target();
    assert.deepEqual(await importSnapshot(db, back), countSnapshot(snap));
  });

  test("I66-5: ортасындағы қате жол (жоқ кезеңге сілтеме) — ештеңе жазылмайды", async () => {
    const db = target();
    const broken: Snapshot = { ...snap, tasks: [...snap.tasks, { ...snap.tasks[0], id: "30000000-0000-4000-8000-0000000000ff", round_id: "жоқ-кезең" }] };
    await assert.rejects(importSnapshot(db, broken));
    assert.deepEqual(Object.values(await countTarget(db)), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test("Turso HTTP жауабы (pipeline) дұрыс оқылады: integer мәтін, blob base64, null", async () => {
    let asked: { url: string; auth: string | null; sqls: string[] } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      asked = { url, auth: new Headers(init.headers).get("authorization"), sqls: body.requests.filter((r: { type: string }) => r.type === "execute").map((r: { stmt: { sql: string } }) => r.stmt.sql) };
      const empty = { type: "ok", response: { type: "execute", result: { cols: [], rows: [] } } };
      const results = asked.sqls.map((sql) => {
        if (sql.includes('"contests"')) return { type: "ok", response: { type: "execute", result: {
          cols: ["id", "slug", "title", "starts_at", "status", "board_locked", "board_autolock_min"].map((name) => ({ name })),
          rows: [[{ type: "text", value: C }, { type: "text", value: "s" }, { type: "text", value: "Жарыс" }, { type: "text", value: "2026-11-01T10:00:00.000Z" }, { type: "text", value: "draft" }, { type: "integer", value: "1" }, { type: "integer", value: "10" }]],
        } } };
        if (sql.includes('"task_images"')) return { type: "ok", response: { type: "execute", result: {
          cols: ["id", "mime", "data", "created_at"].map((name) => ({ name })),
          rows: [[{ type: "text", value: IMG }, { type: "text", value: "image/png" }, { type: "blob", base64: Buffer.from([1, 2, 3]).toString("base64") }, { type: "null" }]],
        } } };
        return empty;
      });
      return new Response(JSON.stringify({ results: [...results, { type: "ok", response: { type: "close" } }] }));
    }) as unknown as typeof fetch;
    const s = await readTurso("libsql://debug-x.turso.io", "tok", fake);
    assert.equal(asked!.url, "https://debug-x.turso.io/v2/pipeline");
    assert.equal(asked!.auth, "Bearer tok");
    assert.equal(asked!.sqls.length, 10);
    assert.deepEqual([s.contests[0].board_locked, s.contests[0].board_autolock_min, s.contests[0].title], [true, 10, "Жарыс"]);
    assert.deepEqual([[...(s.task_images[0].data as Uint8Array)], s.task_images[0].created_at], [[1, 2, 3], null]);
  });
});

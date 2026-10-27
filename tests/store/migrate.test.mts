// Turso (libSQL) миграция runner-і: реті, идемпотенттілік, атомарлық (P51-2, P51-3).
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { migrateLibsql, splitSql } from "../../lib/server/libsqlMigrate.ts";
import { libsqlConfig } from "../../lib/server/libsql.ts";

const dir = mkdtempSync(join(tmpdir(), "debug-libsql-"));
after(() => rmSync(dir, { recursive: true, force: true }));

test("splitSql: Prisma миграциясын нұсқауларға бөледі, түсініктемелерді алып тастайды", () => {
  assert.deepEqual(splitSql('-- CreateTable\nCREATE TABLE "a" ("id" TEXT);\n\n-- CreateIndex\nCREATE INDEX "i" ON "a"("id");\n'), ['CREATE TABLE "a" ("id" TEXT)', 'CREATE INDEX "i" ON "a"("id")']);
});

test("libsqlConfig: TURSO_DATABASE_URL басым, libsql:// DATABASE_URL да танылады, file: — жергілікті", () => {
  assert.deepEqual(libsqlConfig({ TURSO_DATABASE_URL: "libsql://x.turso.io", TURSO_AUTH_TOKEN: "t", DATABASE_URL: "file:./dev.db" }), { url: "libsql://x.turso.io", authToken: "t" });
  assert.deepEqual(libsqlConfig({ DATABASE_URL: "libsql://y.turso.io", DATABASE_AUTH_TOKEN: "u" }), { url: "libsql://y.turso.io", authToken: "u" });
  assert.equal(libsqlConfig({ DATABASE_URL: "file:./dev.db" }), null);
  assert.equal(libsqlConfig({}), null);
});

test("нақты миграциялар бос libSQL файлына қолданылады, екінші іске қосу ештеңе қолданбайды (P51-2)", async () => {
  const client = createClient({ url: `file:${join(dir, "real.db")}` });
  const first = await migrateLibsql(client);
  assert.ok(first.length >= 1 && first[0].endsWith("_init"), JSON.stringify(first));
  const tables = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) => String(r.name));
  for (const t of ["users", "contests", "rounds", "tasks", "submissions", "task_images", "_libsql_migrations"]) assert.ok(tables.includes(t), t);
  assert.deepEqual(await migrateLibsql(client), []);
  client.close();
});

test("қате нұсқаулы миграция толығымен кері қайтарылады, аты жазылмайды (P51-3)", async () => {
  const mig = join(dir, "migs");
  mkdirSync(join(mig, "001_ok"), { recursive: true });
  mkdirSync(join(mig, "002_bad"), { recursive: true });
  writeFileSync(join(mig, "001_ok", "migration.sql"), 'CREATE TABLE "a" ("id" TEXT);\n');
  writeFileSync(join(mig, "002_bad", "migration.sql"), 'CREATE TABLE "b" ("id" TEXT);\nINSERT INTO "nope" VALUES (1);\n');
  const client = createClient({ url: `file:${join(dir, "atomic.db")}` });
  await assert.rejects(migrateLibsql(client, mig));
  const tables = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) => String(r.name));
  assert.ok(tables.includes("a") && !tables.includes("b"), JSON.stringify(tables));
  const names = (await client.execute("SELECT name FROM _libsql_migrations")).rows.map((r) => String(r.name));
  assert.deepEqual(names, ["001_ok"]);
  client.close();
});

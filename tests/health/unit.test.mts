// /api/health логикасы (C65-1): дерекқор жауап берсе 200, бермесе 503; ішкі қате мәтіні шықпайды.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkHealth } from "../../lib/server/health.ts";
import { MemoryStore } from "../../lib/server/store/memory.ts";
import type { Store } from "../../lib/server/store/types.ts";

test("дерекқор жауап берсе → 200 {ok: true, db: up, version}", async () => {
  const r = await checkHealth(() => new MemoryStore(), "abc123");
  assert.deepEqual(r, { status: 200, body: { ok: true, db: "up", version: "abc123" } });
});

test("дерекқор жауап бермесе → 503 {ok: false, db: down}, қате мәтіні жауапта жоқ", async () => {
  const broken = { ping: () => Promise.reject(new Error("connect ECONNREFUSED db-host:5432 password=x")) } as unknown as Store;
  const r = await checkHealth(() => broken, "abc123");
  assert.deepEqual(r, { status: 503, body: { ok: false, db: "down", version: "abc123" } });
  assert.ok(!JSON.stringify(r).includes("ECONNREFUSED"));
});

test("store құрылмаса да (мысалы, DB_DRIVER қате) → 503, ерте лақтырылмайды", async () => {
  const r = await checkHealth(() => { throw new Error("DB_DRIVER=x"); }, "v");
  assert.equal(r.status, 503);
});

test("APP_VERSION берілмесе нұсқа = dev", async () => {
  delete process.env.APP_VERSION;
  assert.equal((await checkHealth(() => new MemoryStore())).body.version, "dev");
});

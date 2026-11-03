// DB_DRIVER таңдауы және дерекқор URL-і (P50-7): ескі `sqlite` мәні үнсіз басқа дерекқорға ауыспай, анық қате береді.
import assert from "node:assert/strict";
import { test } from "node:test";
import { databaseUrl, getStore } from "../../lib/server/store/index.ts";

test("DB_DRIVER=sqlite → рұқсат етілген мәндерді атайтын қате (P50-7)", () => {
  process.env.DB_DRIVER = "sqlite";
  assert.throws(() => getStore(), /DB_DRIVER=sqlite: postgres не memory болуы керек/);
});

test("DB_DRIVER=memory → MemoryStore", () => {
  process.env.DB_DRIVER = "memory";
  assert.equal(getStore().driver, "memory");
});

test("databaseUrl: Neon пулындағы POSTGRES_PRISMA_URL басым, әйтпесе DATABASE_URL", () => {
  assert.equal(databaseUrl({ POSTGRES_PRISMA_URL: "postgresql://pool", DATABASE_URL: "postgresql://direct" }), "postgresql://pool");
  assert.equal(databaseUrl({ POSTGRES_PRISMA_URL: "", DATABASE_URL: "postgresql://direct" }), "postgresql://direct");
  assert.equal(databaseUrl({}), undefined);
});

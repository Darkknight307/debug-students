// Тесттерге уақытша Postgres схемасы: әр іске қосу TEST_DATABASE_URL ішінде өз схемасын жасайды (prisma migrate deploy)
// және соңында өшіреді — әзірлеушінің дерегіне тимейді, қатар жүрген іске қосулар бір-біріне кедергі жасамайды.
//   import { freshSchema, dropSchema } from "./pgSchema.mts"
//   npx tsx tests/pgSchema.mts create e2e   → URL шығарады;   npx tsx tests/pgSchema.mts drop <url>
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || "postgresql://debug:debug@localhost:5432/debug";

export function schemaUrl(base: string, schema: string): string {
  const u = new URL(base);
  u.searchParams.set("schema", schema);
  return u.toString();
}

/** Жаңа схема + миграциялар; қайтарады: сол схемаға қосылатын DATABASE_URL. */
export function freshSchema(prefix: string, base = TEST_DATABASE_URL): string {
  const url = schemaUrl(base, `${prefix}_${Date.now().toString(36)}_${process.pid}`);
  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  } catch (e) {
    const out = String((e as { stderr?: Buffer }).stderr ?? e);
    throw new Error(`Тест дерекқоры дайын емес (${new URL(base).host}). Postgres іске қосыңыз: npm run db:up не TEST_DATABASE_URL беріңіз.\n${out}`);
  }
  return url;
}

export async function dropSchema(url: string): Promise<void> {
  const schema = new URL(url).searchParams.get("schema");
  if (!schema || !/^[a-z0-9_]+$/.test(schema)) throw new Error(`схема аты дұрыс емес: ${schema}`);
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await db.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "create") console.log(freshSchema(arg || "tmp"));
  else if (cmd === "drop" && arg) await dropSchema(arg);
  else {
    console.error("usage: tsx tests/pgSchema.mts create <prefix> | drop <url>");
    process.exit(2);
  }
}

/**
 * Бұрынғы дерекқорды PostgreSQL-ге көшіру (#66). Мақсат: DATABASE_URL (не --to), миграцияланған және бос.
 *   npm run db:import -- --from libsql://<db>.turso.io        (токен: SOURCE_AUTH_TOKEN)
 *   npm run db:import -- --from file:./prisma/dev.db           (бұрынғы SQLite файлы)
 *   npm run db:import -- --from export.json                    (алдыңғы экспорт)
 *   npm run db:import -- --from libsql://… --export export.json (Postgres-ке жазбай, JSON-ға сақтау — AWS үшін, #68)
 * Шығысы — тек кестелер мен жол сандары (көз / мақсат); сандар сәйкес келмесе, код 1.
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { TABLE_NAMES, countSnapshot, importSnapshot, readSource, toJson, type Counts } from "../lib/server/importData";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function table(src: Counts, dst?: Counts) {
  console.log(`${"кесте".padEnd(14)} ${"көз".padStart(6)} ${dst ? "мақсат".padStart(7) : ""}`);
  for (const t of TABLE_NAMES) console.log(`${t.padEnd(14)} ${String(src[t]).padStart(6)} ${dst ? String(dst[t]).padStart(7) + (dst[t] === src[t] ? "" : "  ≠") : ""}`);
}

async function main() {
  const from = arg("from");
  if (!from) throw new Error("--from берілмеген (libsql://…, https://…, file:….db не ….json)");
  const snap = await readSource(from, process.env.SOURCE_AUTH_TOKEN);
  const src = countSnapshot(snap);

  const out = arg("export");
  if (out) {
    writeFileSync(out, toJson(snap), { mode: 0o600 });
    table(src);
    console.log(`экспорт: ${out} (репоға салмаңыз)`);
    return 0;
  }

  const to = arg("to") || process.env.DATABASE_URL;
  if (!to?.startsWith("postgres")) throw new Error("Мақсат Postgres емес: DATABASE_URL не --to postgresql://… беріңіз");
  const db = new PrismaClient({ datasourceUrl: to });
  try {
    const dst = await importSnapshot(db, snap);
    table(src, dst);
    const same = TABLE_NAMES.every((t) => src[t] === dst[t]);
    console.log(same ? "✓ барлық кесте көшірілді, сандар сәйкес" : "✗ сандар сәйкес емес");
    return same ? 0 : 1;
  } finally {
    await db.$disconnect();
  }
}

main().then((code) => process.exit(code), (e) => {
  console.error("Көшіру сәтсіз:", (e as Error).message);
  process.exit(1);
});

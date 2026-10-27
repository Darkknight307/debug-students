import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "@libsql/client";

/**
 * Turso-ға арналған миграция: `prisma migrate deploy` libsql:// URL-ды қолдамайды, сондықтан Prisma жасаған
 * prisma/migrations/<name>/migration.sql файлдарын реті бойынша қолданамыз. Әр миграция — бір транзакция
 * (batch "write"): сәтсіз болса, одан ештеңе қалмайды. Қолданылғандары _libsql_migrations кестесінде.
 */
export function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim())
    .filter(Boolean);
}

export async function migrateLibsql(client: Client, dir = join(process.cwd(), "prisma", "migrations")): Promise<string[]> {
  await client.execute("CREATE TABLE IF NOT EXISTS _libsql_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const done = new Set((await client.execute("SELECT name FROM _libsql_migrations")).rows.map((r) => String(r.name)));
  const names = readdirSync(dir).filter((n) => existsSync(join(dir, n, "migration.sql"))).sort();
  const applied: string[] = [];
  for (const name of names) {
    if (done.has(name)) continue;
    const statements = splitSql(readFileSync(join(dir, name, "migration.sql"), "utf8"));
    await client.batch(
      [...statements, { sql: "INSERT INTO _libsql_migrations (name, applied_at) VALUES (?, ?)", args: [name, new Date().toISOString()] }],
      "write",
    );
    applied.push(name);
  }
  return applied;
}

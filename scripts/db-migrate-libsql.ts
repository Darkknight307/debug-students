/**
 * Turso (libSQL) дерекқорына миграцияларды қолдану: npm run db:migrate:libsql
 * Vercel build-те де орындалады (vercel-build). URL берілмесе — анық хабармен құлайды:
 * уақытша файлға үнсіз ауысу деректі қайта жоғалтар еді (#51).
 */
import { libsqlConfig } from "../lib/server/libsql";
import { migrateLibsql } from "../lib/server/libsqlMigrate";

async function main() {
  const cfg = libsqlConfig();
  if (!cfg) {
    console.error(
      "TURSO_DATABASE_URL берілмеген. Vercel → debug-students → Storage → Create Database → Turso → Connect (айнымалылар өзі қосылады). " +
        "Локалда SQLite файлы үшін: npm run db:deploy",
    );
    process.exit(1);
  }
  const { createClient } = cfg.url.startsWith("file:") ? await import("@libsql/client") : await import("@libsql/client/web");
  const client = createClient(cfg);
  const applied = await migrateLibsql(client);
  console.log(applied.length ? `libSQL: қолданылды — ${applied.join(", ")}` : "libSQL: жаңа миграция жоқ");
  client.close();
}

main().catch((e) => {
  console.error("libSQL миграциясы сәтсіз:", (e as Error).message);
  process.exit(1);
});

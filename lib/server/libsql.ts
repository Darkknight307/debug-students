/**
 * Turso / libSQL — бұлттағы SQLite (продакшн). Prisma схемасы мен миграциялары сол күйі, тек транспорт басқа.
 * URL: TURSO_DATABASE_URL, не DATABASE_URL libsql:/https:/wss: болса. Токен: TURSO_AUTH_TOKEN (не DATABASE_AUTH_TOKEN).
 * Ешқайсысы жоқ болса — жергілікті SQLite файлы (DATABASE_URL=file:…).
 */
export type LibsqlConfig = { url: string; authToken?: string };

export function libsqlConfig(env: Record<string, string | undefined> = process.env): LibsqlConfig | null {
  const db = env.DATABASE_URL ?? "";
  const url = env.TURSO_DATABASE_URL || (/^(libsql|https?|wss?):/.test(db) ? db : "");
  if (!url) return null;
  return { url, authToken: env.TURSO_AUTH_TOKEN || env.DATABASE_AUTH_TOKEN || undefined };
}

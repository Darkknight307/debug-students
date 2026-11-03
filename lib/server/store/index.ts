import { PrismaClient } from "@prisma/client";
import { MemoryStore } from "./memory";
import { PrismaStore } from "./prisma";
import type { Store } from "./types";

const g = globalThis as unknown as { __debugStore?: Store };

/**
 * Бэкендтің жалғыз дерекқор нүктесі. DB_DRIVER: postgres (әдепкі, Prisma ORM) | memory.
 * postgres: DATABASE_URL=postgresql://…; Vercel + Neon-да пулдағы POSTGRES_PRISMA_URL (pgbouncer=true) басым.
 */
export function databaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.POSTGRES_PRISMA_URL || env.DATABASE_URL || undefined;
}

export function getStore(): Store {
  if (g.__debugStore) return g.__debugStore;
  const driver = process.env.DB_DRIVER || "postgres";
  if (driver === "memory") g.__debugStore = new MemoryStore();
  else if (driver === "postgres") g.__debugStore = new PrismaStore(new PrismaClient({ datasourceUrl: databaseUrl() }));
  else throw new Error(`DB_DRIVER=${driver}: postgres не memory болуы керек`);
  return g.__debugStore;
}

export { ConflictError, isConflict } from "./types";
export type * from "./types";

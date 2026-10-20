import { PrismaClient } from "@prisma/client";
import { MemoryStore } from "./memory";
import { PrismaStore } from "./prisma";
import type { Store } from "./types";

/**
 * Бэкендтің жалғыз дерекқор нүктесі. DB_DRIVER: sqlite (әдепкі, Prisma ORM → DATABASE_URL) | memory.
 * Next dev модульдерді қайта жүктегенде қосылым мен дерек жоғалмауы үшін globalThis-те сақталады.
 */
const g = globalThis as unknown as { __debugStore?: Store };

export function getStore(): Store {
  if (g.__debugStore) return g.__debugStore;
  const driver = process.env.DB_DRIVER || "sqlite";
  if (driver === "memory") g.__debugStore = new MemoryStore();
  else if (driver === "sqlite") g.__debugStore = new PrismaStore(new PrismaClient());
  else throw new Error(`DB_DRIVER=${driver}: memory не sqlite болуы керек`);
  return g.__debugStore;
}

export { ConflictError, isConflict } from "./types";
export type * from "./types";

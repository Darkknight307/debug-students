import { MemoryStore } from "./memory";
import type { Store } from "./types";

/**
 * Бэкендтің жалғыз дерекқор нүктесі. DB_DRIVER: memory | sqlite.
 * Next dev модульдерді қайта жүктегенде дерек жоғалмауы үшін globalThis-те сақталады.
 */
const g = globalThis as unknown as { __debugStore?: Store };

export function getStore(): Store {
  if (g.__debugStore) return g.__debugStore;
  const driver = process.env.DB_DRIVER || "memory";
  if (driver !== "memory") throw new Error(`DB_DRIVER=${driver} is not supported yet`);
  g.__debugStore = new MemoryStore();
  return g.__debugStore;
}

export { ConflictError, isConflict } from "./types";
export type * from "./types";

import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { MemoryStore } from "./memory";
import { PrismaStore } from "./prisma";
import type { Store } from "./types";

/**
 * Бэкендтің жалғыз дерекқор нүктесі. DB_DRIVER: sqlite (әдепкі, Prisma ORM → DATABASE_URL) | memory.
 * Next dev модульдерді қайта жүктегенде қосылым мен дерек жоғалмауы үшін globalThis-те сақталады.
 */
const g = globalThis as unknown as { __debugStore?: Store };

/**
 * Vercel демосы: функцияның файл жүйесі тек /tmp-да жазылады және уақытша. SQLITE_TEMPLATE берілсе
 * (build кезінде migrate + seed жасалған prisma/demo.db), ол бірінші сұраныста DATABASE_URL=file:/tmp/… жолына көшіріледі.
 * Дерек инстанс қайта қосылғанша ғана сақталады — тұрақты дерекқор: #51.
 */
function ensureDemoDb() {
  const tpl = process.env.SQLITE_TEMPLATE;
  const url = process.env.DATABASE_URL || "";
  if (!tpl || !url.startsWith("file:/tmp/")) return;
  const target = url.slice("file:".length);
  if (!existsSync(target)) copyFileSync(join(process.cwd(), tpl), target);
}

export function getStore(): Store {
  if (g.__debugStore) return g.__debugStore;
  const driver = process.env.DB_DRIVER || "sqlite";
  if (driver === "memory") g.__debugStore = new MemoryStore();
  else if (driver === "sqlite") {
    ensureDemoDb();
    g.__debugStore = new PrismaStore(new PrismaClient());
  }
  else throw new Error(`DB_DRIVER=${driver}: memory не sqlite болуы керек`);
  return g.__debugStore;
}

export { ConflictError, isConflict } from "./types";
export type * from "./types";

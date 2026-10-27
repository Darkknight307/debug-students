import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql/web";
import { MemoryStore } from "./memory";
import { PrismaStore } from "./prisma";
import { libsqlConfig } from "../libsql";
import type { Store } from "./types";

/**
 * Бэкендтің жалғыз дерекқор нүктесі. DB_DRIVER: sqlite (әдепкі, Prisma ORM) | memory.
 * sqlite: TURSO_DATABASE_URL берілсе — Turso (бұлттағы SQLite, @prisma/adapter-libsql), әйтпесе DATABASE_URL=file:… файлы.
 * Next dev модульдерді қайта жүктегенде қосылым мен дерек жоғалмауы үшін globalThis-те сақталады.
 */
const g = globalThis as unknown as { __debugStore?: Store };

function prismaClient(): PrismaClient {
  const cfg = libsqlConfig();
  if (!cfg) return new PrismaClient(); // жергілікті SQLite файлы
  if (cfg.url.startsWith("file:")) {
    // Тек тесттер үшін (жергілікті libSQL файлы): node нұсқасы native `libsql` модулін керек етеді,
    // сондықтан ол тек осы тармақта жүктеледі — продакшнде таза JS web нұсқасы (http) қолданылады.
    const { PrismaLibSQL: NodeLibSQL } = require("@prisma/adapter-libsql") as typeof import("@prisma/adapter-libsql");
    return new PrismaClient({ adapter: new NodeLibSQL(cfg) });
  }
  return new PrismaClient({ adapter: new PrismaLibSQL(cfg) });
}

export function getStore(): Store {
  if (g.__debugStore) return g.__debugStore;
  const driver = process.env.DB_DRIVER || "sqlite";
  if (driver === "memory") g.__debugStore = new MemoryStore();
  else if (driver === "sqlite") g.__debugStore = new PrismaStore(prismaClient());
  else throw new Error(`DB_DRIVER=${driver}: memory не sqlite болуы керек`);
  return g.__debugStore;
}

export { ConflictError, isConflict } from "./types";
export type * from "./types";

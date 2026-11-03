import { readFileSync } from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Бұрынғы дерекқордан (Turso/libSQL, SQLite файлы не JSON экспорт) PostgreSQL-ге көшіру (#66).
 * Схема сол Prisma моделі, сондықтан кестелер мен бағандар бірдей; тек түрлері ауысады: SQLite-те boolean 0/1,
 * Json — мәтін, Bytes — BLOB. Барлығы бір транзакцияда, тек бос (миграцияланған) дерекқорға жазылады.
 * Жол мазмұны ешқашан шығарылмайды — тек кесте атаулары мен сандар.
 */

type Kind = "text" | "int" | "bool" | "json" | "bytes";
type Columns = Record<string, Kind>;
const text = (...names: string[]): Columns => Object.fromEntries(names.map((n) => [n, "text" as const]));

/** Сыртқы кілттер реті бойынша: алдымен ата-кестелер. */
export const TABLES = {
  users: { model: "user", cols: text("id", "email", "password_hash", "role", "last_name", "first_name", "full_name", "university", "course", "phone", "first_login_at", "last_login_at") },
  reset_tokens: { model: "resetToken", cols: text("token_hash", "user_id", "expires_at") },
  contests: { model: "contest", cols: { ...text("id", "slug", "title", "starts_at", "status"), board_locked: "bool", board_autolock_min: "int" } },
  rounds: { model: "round", cols: { ...text("id", "contest_id", "kind", "title", "status", "started_at", "ends_at"), idx: "int", duration_min: "int" } },
  tasks: {
    model: "task",
    cols: {
      ...text("id", "round_id", "title", "statement", "correct", "starter_code", "solution_code", "variant", "image_url", "entry"),
      idx: "int", points: "int", max_changed_lines: "int", options: "json", forbidden: "json", ai_refs: "json", tests_public: "json", tests_hidden: "json",
    },
  },
  submissions: {
    model: "submission",
    cols: { ...text("contest_id", "round_id", "task_id", "student_id", "answer", "code", "reason", "created_at"), id: "int", is_correct: "bool", points: "int" },
  },
  extensions: { model: "extension", cols: { ...text("round_id", "student_id"), extra_min: "int" } },
  variants: { model: "variant", cols: text("contest_id", "student_id", "variant") },
  activity: { model: "activity", cols: { ...text("round_id", "student_id", "contest_id", "updated_at"), data: "json" } },
  task_images: { model: "taskImage", cols: { ...text("id", "mime", "created_at"), data: "bytes" } },
} as const satisfies Record<string, { model: string; cols: Columns }>;

export type Table = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as Table[];
export type Row = Record<string, unknown>;
export type Snapshot = Record<Table, Row[]>;
export type Counts = Record<Table, number>;

/** Бір мәнді Postgres-ке жарайтын түрге келтіреді (SQLite/Turso/JSON экспорттың қайсысынан келсе де). */
function convert(kind: Kind, v: unknown, where: string): unknown {
  if (v === null || v === undefined) return null;
  switch (kind) {
    case "text":
      return String(v);
    case "int": {
      const n = typeof v === "bigint" ? Number(v) : Number(v);
      if (!Number.isInteger(n)) throw new Error(`${where}: бүтін сан емес`);
      return n;
    }
    case "bool":
      return v === true || v === 1 || v === 1n || v === "1" || v === "true";
    case "json":
      return typeof v === "string" ? JSON.parse(v) : v;
    case "bytes":
      if (v instanceof Uint8Array) return v;
      if (typeof v === "object" && v && "$bytes" in v) return Uint8Array.from(Buffer.from(String((v as { $bytes: string }).$bytes), "base64"));
      throw new Error(`${where}: байттар күтілген`);
  }
}

export function normalize(table: Table, rows: Row[]): Row[] {
  const cols = TABLES[table].cols as Columns;
  return rows.map((r, i) => {
    const out: Row = {};
    for (const [c, kind] of Object.entries(cols)) {
      if (!(c in r)) throw new Error(`${table}[${i}]: «${c}» бағаны жоқ`);
      out[c] = convert(kind, r[c], `${table}[${i}].${c}`);
    }
    return out;
  });
}

const emptySnapshot = (): Snapshot => Object.fromEntries(TABLE_NAMES.map((t) => [t, []])) as unknown as Snapshot;

/* ---------- көздер ---------- */

/** Turso / libSQL: HTTP API (/v2/pipeline) арқылы, тәуелділіксіз. URL: libsql://… не https://… */
export async function readTurso(url: string, token: string | undefined, fetchImpl: typeof fetch = fetch): Promise<Snapshot> {
  const base = url.replace(/^libsql:\/\//, "https://").replace(/\/+$/, "");
  const requests = [...TABLE_NAMES.map((t) => ({ type: "execute", stmt: { sql: `SELECT * FROM "${t}"` } })), { type: "close" }];
  const res = await fetchImpl(`${base}/v2/pipeline`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`Turso: HTTP ${res.status}`);
  const body = (await res.json()) as { results: { type: string; error?: { message: string }; response?: { result: TursoResult } }[] };
  const snap = emptySnapshot();
  TABLE_NAMES.forEach((t, i) => {
    const r = body.results[i];
    if (r?.type !== "ok" || !r.response) throw new Error(`Turso: ${t} кестесі оқылмады (${r?.error?.message ?? "белгісіз қате"})`);
    const { cols, rows } = r.response.result;
    snap[t] = normalize(t, rows.map((row) => Object.fromEntries(row.map((v, k) => [cols[k].name, tursoValue(v)]))));
  });
  return snap;
}
type TursoValue = { type: "null" } | { type: "integer"; value: string } | { type: "float"; value: number } | { type: "text"; value: string } | { type: "blob"; base64: string };
type TursoResult = { cols: { name: string }[]; rows: TursoValue[][] };
function tursoValue(v: TursoValue): unknown {
  switch (v.type) {
    case "null": return null;
    case "integer": return Number(v.value);
    case "float": return v.value;
    case "text": return v.value;
    case "blob": return Uint8Array.from(Buffer.from(v.base64, "base64"));
  }
}

/** Жергілікті SQLite файлы (бұрынғы prisma/dev.db): Node-тың өз node:sqlite модулі арқылы. */
export async function readSqliteFile(path: string): Promise<Snapshot> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const snap = emptySnapshot();
    for (const t of TABLE_NAMES) snap[t] = normalize(t, db.prepare(`SELECT * FROM "${t}"`).all() as Row[]);
    return snap;
  } finally {
    db.close();
  }
}

/** JSON экспорт: байттар {"$bytes": base64} түрінде. */
export function toJson(snap: Snapshot): string {
  return JSON.stringify(snap, (_k, v) => (v instanceof Uint8Array ? { $bytes: Buffer.from(v).toString("base64") } : v));
}
export function readJsonFile(path: string): Snapshot {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<Snapshot>;
  const snap = emptySnapshot();
  for (const t of TABLE_NAMES) snap[t] = normalize(t, raw[t] ?? []);
  return snap;
}

export async function readSource(from: string, token?: string): Promise<Snapshot> {
  if (/^(libsql|https?):\/\//.test(from)) return readTurso(from, token);
  if (from.startsWith("file:")) return readSqliteFile(from.slice("file:".length));
  if (from.endsWith(".json")) return readJsonFile(from);
  throw new Error(`Көз танылмады: ${from} (libsql://…, https://…, file:….db не ….json)`);
}

export const countSnapshot = (s: Snapshot): Counts => Object.fromEntries(TABLE_NAMES.map((t) => [t, s[t].length])) as Counts;

/* ---------- Postgres ---------- */

type Delegate = { count(): Promise<number>; createMany(a: { data: Row[] }): Promise<unknown> };
const delegate = (db: PrismaClient | Prisma.TransactionClient, t: Table) => (db as unknown as Record<string, Delegate>)[TABLES[t].model];

export async function countTarget(db: PrismaClient): Promise<Counts> {
  const out = {} as Counts;
  for (const t of TABLE_NAMES) out[t] = await delegate(db, t).count();
  return out;
}

/** Бос дерекқорға бір транзакциямен жазады; бос болмаса — ештеңе жазбай қате береді. */
export async function importSnapshot(db: PrismaClient, snap: Snapshot): Promise<Counts> {
  const before = await countTarget(db);
  const busy = TABLE_NAMES.filter((t) => before[t] > 0);
  if (busy.length) throw new Error(`Мақсатты дерекқор бос емес (${busy.join(", ")}) — көшіру тек жаңа, миграцияланған дерекқорға жасалады`);
  await db.$transaction(
    async (tx) => {
      for (const t of TABLE_NAMES) {
        if (!snap[t].length) continue;
        const data = snap[t].map((r) => {
          const row = { ...r };
          for (const [c, k] of Object.entries(TABLES[t].cols as Columns)) {
            if (k === "json" && row[c] === null) row[c] = Prisma.JsonNull; // nullable Json-дағы null — Prisma.JsonNull
            if (k === "bytes") row[c] = Buffer.from(row[c] as Uint8Array);
          }
          return row;
        });
        await delegate(tx, t).createMany({ data });
      }
      // id-лері анық көшірілген жіберілімдерден кейін SERIAL тізбегі ең үлкен id-ден әрі жалғасады
      await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('submissions', 'id'), COALESCE((SELECT MAX(id) FROM submissions), 0) + 1, false)`);
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  return countTarget(db);
}

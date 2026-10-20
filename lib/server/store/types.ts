/**
 * Сақтау қабатының жалғыз интерфейсі. Бэкенд (lib/server/*) дерекқорды тек осы арқылы көреді.
 * Екі іске асыру бірдей контракт тесттерінен өтеді (tests/store/contract.test.mts):
 *   MemoryStore  — жадта (DB_DRIVER=memory: тесттер, жылдам іске қосу)
 *   PrismaStore  — Prisma ORM → SQLite (DB_DRIVER=sqlite, әдепкі)
 * Бизнес-ережелер (рейтинг, кезең терезелері, start/extend/close) мұнда емес — lib/contest/logic.ts пен сервистерде.
 */
import type { AdminContest, AdminRound, AdminTask } from "../../client/types";

export type Role = "student" | "admin";

export type UserRow = {
  id: string;
  email: string;
  role: Role;
  last_name: string;
  first_name: string;
  full_name: string;
  university: string;
  course: string | null;
  phone: string | null;
  first_login_at: string;
  last_login_at: string;
};
export type UserSecret = UserRow & { password_hash: string };
export type NewUser = Omit<UserSecret, "id" | "first_login_at" | "last_login_at"> & { id?: string; first_login_at?: string };

export type ResetTokenRow = { token_hash: string; user_id: string; expires_at: string };

export type SubmissionRow = {
  id: number;
  contest_id: string;
  round_id: string;
  task_id: string;
  student_id: string;
  answer: string | null;
  code: string | null;
  is_correct: boolean;
  points: number;
  reason: string | null;
  created_at: string;
};
export type NewSubmission = Omit<SubmissionRow, "id" | "created_at"> & { created_at?: string };

export type ExtensionRow = { round_id: string; student_id: string; extra_min: number };
export type VariantRow = { contest_id: string; student_id: string; variant: "A" | "B" };
export type ActivityRow = { round_id: string; student_id: string; contest_id: string; data: Record<string, unknown>; updated_at: string };
export type ImageRow = { id: string; mime: string; data: Uint8Array; created_at: string };

export type NewContest = Omit<AdminContest, "id"> & { id?: string };
export type NewRound = Omit<AdminRound, "id" | "contest_id"> & { id?: string };
export type NewTask = Omit<AdminTask, "id"> & { id?: string };

/** Бірегейлік бұзылды (email, slug, (кезең, нөмір, нұсқа)) → HTTP 409. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Next.js әр маршрутты бөлек бума етіп жинайды, ал store globalThis-те бір рет құрылады — басқа бумадағы
 * ConflictError үшін `instanceof` жалған болады (#60). Сондықтан атауы бойынша тексереміз.
 */
export function isConflict(e: unknown): boolean {
  return e instanceof Error && e.name === "ConflictError";
}

/** Тест ілмектері үшін кестелер (e2e: seed / dump / patch). */
export type TableName = "users" | "contests" | "rounds" | "tasks" | "submissions" | "extensions" | "variants" | "activity" | "reset_tokens";
export type Dump = Record<TableName, Record<string, unknown>[]>;

export interface Store {
  readonly driver: "memory" | "sqlite";

  /* users */
  createUser(u: NewUser): Promise<UserRow>;
  userByEmail(email: string): Promise<UserSecret | null>;
  userById(id: string): Promise<UserRow | null>;
  updateUser(id: string, patch: Partial<Omit<UserSecret, "id">>): Promise<void>;
  /** Студенттер: тіркелген уақыты бойынша (ең жаңасы бірінші) немесе аты бойынша ізденіс. */
  listStudents(opts: { limit?: number; nameLike?: string; order: "newest" | "name" }): Promise<UserRow[]>;
  countStudents(): Promise<number>;
  usersByIds(ids: string[]): Promise<UserRow[]>;

  /* reset tokens */
  addResetToken(t: ResetTokenRow): Promise<void>;
  /** Токенді өшіріп қайтарады (бір рет қана). */
  takeResetToken(tokenHash: string): Promise<ResetTokenRow | null>;

  /* contests, rounds, tasks */
  listContests(): Promise<AdminContest[]>;
  getContest(id: string): Promise<AdminContest | null>;
  createContest(c: NewContest, rounds: NewRound[]): Promise<AdminContest>;
  updateContest(id: string, patch: Partial<Omit<AdminContest, "id">>): Promise<AdminContest | null>;
  listRounds(contestId: string): Promise<AdminRound[]>;
  getRound(id: string): Promise<AdminRound | null>;
  /** Бір транзакцияда (кезеңді бастау басқасын жабады). */
  updateRounds(patches: { id: string; patch: Partial<AdminRound> }[]): Promise<void>;
  listTasks(roundIds: string[]): Promise<AdminTask[]>;
  getTask(id: string): Promise<AdminTask | null>;
  createTask(t: NewTask): Promise<AdminTask>;
  updateTask(id: string, patch: Partial<Omit<AdminTask, "id">>): Promise<AdminTask | null>;
  deleteTask(id: string): Promise<boolean>;

  /* contest activity */
  listExtensions(roundIds: string[]): Promise<ExtensionRow[]>;
  setExtension(e: ExtensionRow): Promise<void>;
  getVariant(contestId: string, studentId: string): Promise<VariantRow | null>;
  /** Бірінші жазылған нұсқа жеңеді; нақты сақталғанын қайтарады. */
  addVariantIfAbsent(v: VariantRow): Promise<VariantRow>;
  countVariants(contestId: string): Promise<number>;
  addSubmission(s: NewSubmission): Promise<SubmissionRow>;
  /** created_at, id бойынша өсу ретімен. */
  listSubmissions(f: { contestId?: string; studentIds?: string[]; taskIds?: string[] }): Promise<SubmissionRow[]>;
  countSubmissions(contestId: string): Promise<number>;
  upsertActivity(a: ActivityRow): Promise<void>;
  listActivity(contestId: string): Promise<ActivityRow[]>;

  /* images */
  addImage(img: ImageRow): Promise<void>;
  getImage(id: string): Promise<ImageRow | null>;

  /* service */
  ping(): Promise<void>;

  /* test hooks (E2E_TEST_HOOKS=1) */
  reset(): Promise<void>;
  seed(data: Partial<Dump>): Promise<void>;
  dump(): Promise<Dump>;
  patch(table: TableName, id: string, set: Record<string, unknown>): Promise<void>;
}

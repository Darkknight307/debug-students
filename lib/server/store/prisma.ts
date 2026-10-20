import crypto from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import type { AdminContest, AdminRound, AdminTask } from "../../client/types";
import {
  ConflictError, type ActivityRow, type Dump, type ExtensionRow, type ImageRow, type NewContest, type NewRound, type NewSubmission,
  type NewTask, type NewUser, type ResetTokenRow, type Store, type SubmissionRow, type TableName, type UserRow, type UserSecret,
  type VariantRow,
} from "./types";

/**
 * Prisma ORM арқылы SQLite (DB_DRIVER=sqlite, DATABASE_URL=file:./dev.db). MemoryStore-мен бірдей контрактты
 * орындайды (tests/store/contract.test.mts). Prisma DBMS-тен тәуелсіз — Postgres-ке ауысу схемадағы провайдер.
 */

const now = () => new Date().toISOString();
const publicUser = ({ password_hash: _p, ...u }: UserSecret): UserRow => u as UserRow;
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

type TaskRecord = Prisma.TaskGetPayload<object>;
const toTask = (t: TaskRecord): AdminTask => ({
  ...t,
  variant: (t.variant as "A" | "B" | null) ?? null,
  options: (t.options as AdminTask["options"]) ?? null,
  forbidden: (t.forbidden as string[]) ?? [],
  ai_refs: (t.ai_refs as string[]) ?? [],
  tests_public: (t.tests_public as AdminTask["tests_public"]) ?? [],
  tests_hidden: (t.tests_hidden as AdminTask["tests_hidden"]) ?? [],
});
const taskData = (t: Partial<Omit<AdminTask, "id">>) => {
  const d: Record<string, unknown> = { ...t };
  if ("options" in t) d.options = t.options === null ? Prisma.JsonNull : t.options;
  return d as Prisma.TaskUncheckedUpdateInput;
};
const toRound = (r: Prisma.RoundGetPayload<object>) => r as unknown as AdminRound;
const toContest = (c: Prisma.ContestGetPayload<object>) => c as unknown as AdminContest;

export class PrismaStore implements Store {
  readonly driver = "sqlite" as const;
  constructor(private db: PrismaClient) {}

  /* users */
  async createUser(u: NewUser) {
    const at = u.first_login_at ?? now();
    try {
      const row = await this.db.user.create({ data: { ...u, email: u.email.toLowerCase(), id: u.id ?? crypto.randomUUID(), first_login_at: at, last_login_at: at } });
      return publicUser(row as UserSecret);
    } catch (e) {
      if (isUnique(e)) throw new ConflictError("email exists");
      throw e;
    }
  }
  async userByEmail(email: string) {
    return (await this.db.user.findUnique({ where: { email: email.toLowerCase() } })) as UserSecret | null;
  }
  async userById(id: string) {
    const u = await this.db.user.findUnique({ where: { id } });
    return u ? publicUser(u as UserSecret) : null;
  }
  async updateUser(id: string, patch: Partial<Omit<UserSecret, "id">>) {
    await this.db.user.updateMany({ where: { id }, data: patch });
  }
  async listStudents({ limit, nameLike, order }: { limit?: number; nameLike?: string; order: "newest" | "name" }) {
    const orderBy = order === "newest" ? { first_login_at: "desc" as const } : { full_name: "asc" as const };
    if (!nameLike) return (await this.db.user.findMany({ where: { role: "student" }, orderBy, ...(limit ? { take: limit } : {}) })).map((u) => publicUser(u as UserSecret));
    // SQLite-тің LIKE/contains-ы кирилл әріптерінде регистрді ескереді — регистрсіз іздеуді осында жасаймыз
    const q = nameLike.toLowerCase();
    const all = await this.db.user.findMany({ where: { role: "student" }, orderBy });
    return all.filter((u) => u.full_name.toLowerCase().includes(q)).slice(0, limit ?? all.length).map((u) => publicUser(u as UserSecret));
  }
  async countStudents() {
    return this.db.user.count({ where: { role: "student" } });
  }
  async usersByIds(ids: string[]) {
    if (!ids.length) return [];
    return (await this.db.user.findMany({ where: { id: { in: ids } } })).map((u) => publicUser(u as UserSecret));
  }

  /* reset tokens */
  async addResetToken(t: ResetTokenRow) {
    await this.db.resetToken.create({ data: t });
  }
  async takeResetToken(tokenHash: string) {
    return this.db.$transaction(async (tx) => {
      const t = await tx.resetToken.findUnique({ where: { token_hash: tokenHash } });
      if (!t) return null;
      await tx.resetToken.delete({ where: { token_hash: tokenHash } });
      return t;
    });
  }

  /* contests, rounds, tasks */
  async listContests() {
    return (await this.db.contest.findMany({ orderBy: { starts_at: "desc" } })).map(toContest);
  }
  async getContest(id: string) {
    const c = await this.db.contest.findUnique({ where: { id } });
    return c ? toContest(c) : null;
  }
  async createContest(c: NewContest, rounds: NewRound[]) {
    try {
      const row = await this.db.contest.create({
        data: { ...c, id: c.id ?? crypto.randomUUID(), rounds: { create: rounds.map((r) => ({ ...r, id: r.id ?? crypto.randomUUID() })) } },
      });
      return toContest(row);
    } catch (e) {
      if (isUnique(e)) throw new ConflictError("slug exists");
      throw e;
    }
  }
  async updateContest(id: string, patch: Partial<Omit<AdminContest, "id">>) {
    try {
      const n = await this.db.contest.updateMany({ where: { id }, data: patch });
      return n.count ? this.getContest(id) : null;
    } catch (e) {
      if (isUnique(e)) throw new ConflictError("slug exists");
      throw e;
    }
  }
  async listRounds(contestId: string) {
    return (await this.db.round.findMany({ where: { contest_id: contestId }, orderBy: { idx: "asc" } })).map(toRound);
  }
  async getRound(id: string) {
    const r = await this.db.round.findUnique({ where: { id } });
    return r ? toRound(r) : null;
  }
  async updateRounds(patches: { id: string; patch: Partial<AdminRound> }[]) {
    await this.db.$transaction(patches.map((p) => this.db.round.updateMany({ where: { id: p.id }, data: p.patch })));
  }
  async listTasks(roundIds: string[]) {
    if (!roundIds.length) return [];
    const rows = await this.db.task.findMany({ where: { round_id: { in: roundIds } }, orderBy: [{ idx: "asc" }, { variant: "asc" }] });
    return rows.map(toTask);
  }
  async getTask(id: string) {
    const t = await this.db.task.findUnique({ where: { id } });
    return t ? toTask(t) : null;
  }
  /** (кезең, нөмір, нұсқа) — SQLite unique индексінде NULL-дар бірдей саналмайды, сондықтан транзакцияда тексереміз. */
  private async taken(tx: Prisma.TransactionClient, k: { round_id: string; idx: number; variant: string | null }, exceptId?: string) {
    const hit = await tx.task.findFirst({ where: { round_id: k.round_id, idx: k.idx, variant: k.variant ?? null, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
    return !!hit;
  }
  async createTask(t: NewTask) {
    return this.db.$transaction(async (tx) => {
      if (await this.taken(tx, t)) throw new ConflictError("task exists");
      const row = await tx.task.create({ data: { ...(taskData(t) as Prisma.TaskUncheckedCreateInput), id: t.id ?? crypto.randomUUID() } });
      return toTask(row);
    });
  }
  async updateTask(id: string, patch: Partial<Omit<AdminTask, "id">>) {
    return this.db.$transaction(async (tx) => {
      const cur = await tx.task.findUnique({ where: { id } });
      if (!cur) return null;
      const next = { round_id: patch.round_id ?? cur.round_id, idx: patch.idx ?? cur.idx, variant: patch.variant !== undefined ? patch.variant : cur.variant };
      if (await this.taken(tx, next, id)) throw new ConflictError("task exists");
      return toTask(await tx.task.update({ where: { id }, data: taskData(patch) }));
    });
  }
  async deleteTask(id: string) {
    return (await this.db.task.deleteMany({ where: { id } })).count > 0;
  }

  /* contest activity */
  async listExtensions(roundIds: string[]) {
    if (!roundIds.length) return [];
    return this.db.extension.findMany({ where: { round_id: { in: roundIds } } }) as Promise<ExtensionRow[]>;
  }
  async setExtension(e: ExtensionRow) {
    await this.db.extension.upsert({ where: { round_id_student_id: { round_id: e.round_id, student_id: e.student_id } }, create: e, update: { extra_min: e.extra_min } });
  }
  async getVariant(contestId: string, studentId: string) {
    return (await this.db.variant.findUnique({ where: { contest_id_student_id: { contest_id: contestId, student_id: studentId } } })) as VariantRow | null;
  }
  async addVariantIfAbsent(v: VariantRow) {
    try {
      await this.db.variant.create({ data: v });
    } catch (e) {
      if (!isUnique(e)) throw e; // қатар келген екінші сұраныс — біріншісі жеңеді
    }
    return (await this.getVariant(v.contest_id, v.student_id))!;
  }
  async countVariants(contestId: string) {
    return this.db.variant.count({ where: { contest_id: contestId } });
  }
  async addSubmission(s: NewSubmission) {
    return (await this.db.submission.create({ data: { ...s, created_at: s.created_at ?? now() } })) as SubmissionRow;
  }
  async listSubmissions({ contestId, studentIds, taskIds }: { contestId?: string; studentIds?: string[]; taskIds?: string[] }) {
    return (await this.db.submission.findMany({
      where: { ...(contestId ? { contest_id: contestId } : {}), ...(studentIds ? { student_id: { in: studentIds } } : {}), ...(taskIds ? { task_id: { in: taskIds } } : {}) },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    })) as SubmissionRow[];
  }
  async countSubmissions(contestId: string) {
    return this.db.submission.count({ where: { contest_id: contestId } });
  }
  async upsertActivity(a: ActivityRow) {
    const data = { ...a, data: a.data as Prisma.InputJsonValue };
    await this.db.activity.upsert({ where: { round_id_student_id: { round_id: a.round_id, student_id: a.student_id } }, create: data, update: data });
  }
  async listActivity(contestId: string) {
    return (await this.db.activity.findMany({ where: { contest_id: contestId } })) as ActivityRow[];
  }

  /* images */
  async addImage(img: ImageRow) {
    await this.db.taskImage.create({ data: { ...img, data: Buffer.from(img.data) } });
  }
  async getImage(id: string) {
    const i = await this.db.taskImage.findUnique({ where: { id } });
    return i ? { ...i, data: new Uint8Array(i.data) } : null;
  }

  async ping() {
    await this.db.contest.count();
  }

  /* test hooks */
  async reset() {
    await this.db.$transaction([
      this.db.submission.deleteMany(), this.db.activity.deleteMany(), this.db.extension.deleteMany(), this.db.variant.deleteMany(),
      this.db.task.deleteMany(), this.db.round.deleteMany(), this.db.contest.deleteMany(), this.db.resetToken.deleteMany(),
      this.db.taskImage.deleteMany(), this.db.user.deleteMany(),
    ]);
  }
  private model(table: TableName) {
    const m = { users: this.db.user, reset_tokens: this.db.resetToken, contests: this.db.contest, rounds: this.db.round, tasks: this.db.task, submissions: this.db.submission, extensions: this.db.extension, variants: this.db.variant, activity: this.db.activity } as const;
    return m[table] as unknown as { deleteMany(a?: object): Promise<unknown>; create(a: object): Promise<unknown>; findMany(a?: object): Promise<Record<string, unknown>[]>; updateMany(a: object): Promise<unknown> };
  }
  async seed(data: Partial<Dump>) {
    // Тәуелділік реті: алдымен ата-кестелер
    const order: TableName[] = ["users", "contests", "rounds", "tasks", "submissions", "extensions", "variants", "activity", "reset_tokens"];
    for (const t of [...order].reverse()) if (data[t]) await this.model(t).deleteMany();
    for (const t of order) {
      for (const row of data[t] ?? []) {
        const r = { ...row } as Record<string, unknown>;
        if (t === "tasks" && r.options === null) r.options = Prisma.JsonNull;
        if (t === "submissions") { r.created_at ??= now(); r.reason ??= null; }
        await this.model(t).create({ data: r });
      }
    }
  }
  async dump(): Promise<Dump> {
    const out: Partial<Dump> = {};
    for (const t of ["users", "contests", "rounds", "tasks", "submissions", "extensions", "variants", "activity", "reset_tokens"] as TableName[]) {
      const rows = await this.model(t).findMany();
      out[t] = t === "users" ? rows.map((u) => publicUser(u as unknown as UserSecret)) : rows;
    }
    return out as Dump;
  }
  async patch(table: TableName, id: string, set: Record<string, unknown>) {
    await this.model(table).updateMany({ where: { id }, data: set });
  }
}

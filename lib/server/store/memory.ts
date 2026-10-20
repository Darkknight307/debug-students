import crypto from "node:crypto";
import type { AdminContest, AdminRound, AdminTask } from "../../client/types";
import {
  ConflictError, type ActivityRow, type Dump, type ExtensionRow, type ImageRow, type NewContest, type NewRound, type NewSubmission,
  type NewTask, type NewUser, type ResetTokenRow, type Store, type SubmissionRow, type TableName, type UserRow, type UserSecret,
  type VariantRow,
} from "./types";

/** Жадтағы Store: тесттер мен жылдам іске қосу үшін. Процесс қайта қосылса, дерек жоғалады. */

const now = () => new Date().toISOString();
const clone = <T>(v: T): T => structuredClone(v);
const publicUser = ({ password_hash: _p, ...u }: UserSecret): UserRow => u;
const sameTaskKey = (a: { round_id: string; idx: number; variant: string | null }, b: { round_id: string; idx: number; variant: string | null }) =>
  a.round_id === b.round_id && a.idx === b.idx && (a.variant ?? null) === (b.variant ?? null);
const bySub = (a: SubmissionRow, b: SubmissionRow) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id);

type Tables = {
  users: UserSecret[];
  reset_tokens: ResetTokenRow[];
  contests: AdminContest[];
  rounds: AdminRound[];
  tasks: AdminTask[];
  submissions: SubmissionRow[];
  extensions: ExtensionRow[];
  variants: VariantRow[];
  activity: ActivityRow[];
  images: ImageRow[];
};
const empty = (): Tables => ({ users: [], reset_tokens: [], contests: [], rounds: [], tasks: [], submissions: [], extensions: [], variants: [], activity: [], images: [] });

export class MemoryStore implements Store {
  readonly driver = "memory" as const;
  private t: Tables = empty();
  private seq = 0;

  /* users */
  async createUser(u: NewUser) {
    const email = u.email.toLowerCase();
    if (this.t.users.some((x) => x.email === email)) throw new ConflictError("email exists");
    const at = u.first_login_at ?? now();
    const row: UserSecret = { ...u, email, id: u.id ?? crypto.randomUUID(), first_login_at: at, last_login_at: at };
    this.t.users.push(row);
    return publicUser(clone(row));
  }
  async userByEmail(email: string) {
    const u = this.t.users.find((x) => x.email === email.toLowerCase());
    return u ? clone(u) : null;
  }
  async userById(id: string) {
    const u = this.t.users.find((x) => x.id === id);
    return u ? publicUser(clone(u)) : null;
  }
  async updateUser(id: string, patch: Partial<Omit<UserSecret, "id">>) {
    const u = this.t.users.find((x) => x.id === id);
    if (u) Object.assign(u, patch);
  }
  async listStudents({ limit, nameLike, order }: { limit?: number; nameLike?: string; order: "newest" | "name" }) {
    let rows = this.t.users.filter((u) => u.role === "student");
    if (nameLike) rows = rows.filter((u) => u.full_name.toLowerCase().includes(nameLike.toLowerCase()));
    rows = [...rows].sort((a, b) => (order === "newest" ? b.first_login_at.localeCompare(a.first_login_at) : a.full_name.localeCompare(b.full_name)));
    return rows.slice(0, limit ?? rows.length).map((u) => publicUser(clone(u)));
  }
  async countStudents() {
    return this.t.users.filter((u) => u.role === "student").length;
  }
  async usersByIds(ids: string[]) {
    const set = new Set(ids);
    return this.t.users.filter((u) => set.has(u.id)).map((u) => publicUser(clone(u)));
  }

  /* reset tokens */
  async addResetToken(t: ResetTokenRow) {
    this.t.reset_tokens.push({ ...t });
  }
  async takeResetToken(tokenHash: string) {
    const i = this.t.reset_tokens.findIndex((x) => x.token_hash === tokenHash);
    if (i < 0) return null;
    return this.t.reset_tokens.splice(i, 1)[0];
  }

  /* contests, rounds, tasks */
  async listContests() {
    return clone([...this.t.contests].sort((a, b) => b.starts_at.localeCompare(a.starts_at)));
  }
  async getContest(id: string) {
    const c = this.t.contests.find((x) => x.id === id);
    return c ? clone(c) : null;
  }
  async createContest(c: NewContest, rounds: NewRound[]) {
    if (this.t.contests.some((x) => x.slug === c.slug)) throw new ConflictError("slug exists");
    const row: AdminContest = { ...c, id: c.id ?? crypto.randomUUID() };
    this.t.contests.push(row);
    for (const r of rounds) this.t.rounds.push({ ...r, id: r.id ?? crypto.randomUUID(), contest_id: row.id });
    return clone(row);
  }
  async updateContest(id: string, patch: Partial<Omit<AdminContest, "id">>) {
    const c = this.t.contests.find((x) => x.id === id);
    if (!c) return null;
    if (patch.slug && this.t.contests.some((x) => x.id !== id && x.slug === patch.slug)) throw new ConflictError("slug exists");
    Object.assign(c, patch);
    return clone(c);
  }
  async listRounds(contestId: string) {
    return clone(this.t.rounds.filter((r) => r.contest_id === contestId).sort((a, b) => a.idx - b.idx));
  }
  async getRound(id: string) {
    const r = this.t.rounds.find((x) => x.id === id);
    return r ? clone(r) : null;
  }
  async updateRounds(patches: { id: string; patch: Partial<AdminRound> }[]) {
    for (const p of patches) {
      const r = this.t.rounds.find((x) => x.id === p.id);
      if (r) Object.assign(r, p.patch);
    }
  }
  async listTasks(roundIds: string[]) {
    const set = new Set(roundIds);
    return clone(this.t.tasks.filter((t) => set.has(t.round_id)).sort((a, b) => a.idx - b.idx || (a.variant ?? "").localeCompare(b.variant ?? "")));
  }
  async getTask(id: string) {
    const t = this.t.tasks.find((x) => x.id === id);
    return t ? clone(t) : null;
  }
  async createTask(t: NewTask) {
    if (this.t.tasks.some((x) => sameTaskKey(x, t))) throw new ConflictError("task exists");
    const row: AdminTask = { ...clone(t), id: t.id ?? crypto.randomUUID() };
    this.t.tasks.push(row);
    return clone(row);
  }
  async updateTask(id: string, patch: Partial<Omit<AdminTask, "id">>) {
    const t = this.t.tasks.find((x) => x.id === id);
    if (!t) return null;
    const next = { ...t, ...clone(patch) };
    if (this.t.tasks.some((x) => x.id !== id && sameTaskKey(x, next))) throw new ConflictError("task exists");
    Object.assign(t, next);
    return clone(t);
  }
  async deleteTask(id: string) {
    const before = this.t.tasks.length;
    this.t.tasks = this.t.tasks.filter((t) => t.id !== id);
    return this.t.tasks.length < before;
  }

  /* contest activity */
  async listExtensions(roundIds: string[]) {
    const set = new Set(roundIds);
    return clone(this.t.extensions.filter((e) => set.has(e.round_id)));
  }
  async setExtension(e: ExtensionRow) {
    const prev = this.t.extensions.find((x) => x.round_id === e.round_id && x.student_id === e.student_id);
    if (prev) prev.extra_min = e.extra_min;
    else this.t.extensions.push({ ...e });
  }
  async getVariant(contestId: string, studentId: string) {
    const v = this.t.variants.find((x) => x.contest_id === contestId && x.student_id === studentId);
    return v ? clone(v) : null;
  }
  async addVariantIfAbsent(v: VariantRow) {
    const prev = this.t.variants.find((x) => x.contest_id === v.contest_id && x.student_id === v.student_id);
    if (prev) return clone(prev);
    this.t.variants.push({ ...v });
    return { ...v };
  }
  async countVariants(contestId: string) {
    return this.t.variants.filter((v) => v.contest_id === contestId).length;
  }
  async addSubmission(s: NewSubmission) {
    const row: SubmissionRow = { ...s, id: ++this.seq, created_at: s.created_at ?? now() };
    this.t.submissions.push(row);
    return clone(row);
  }
  async listSubmissions({ contestId, studentIds, taskIds }: { contestId?: string; studentIds?: string[]; taskIds?: string[] }) {
    const st = studentIds && new Set(studentIds);
    const tk = taskIds && new Set(taskIds);
    return clone(
      this.t.submissions
        .filter((s) => (!contestId || s.contest_id === contestId) && (!st || st.has(s.student_id)) && (!tk || tk.has(s.task_id)))
        .sort(bySub),
    );
  }
  async countSubmissions(contestId: string) {
    return this.t.submissions.filter((s) => s.contest_id === contestId).length;
  }
  async upsertActivity(a: ActivityRow) {
    const prev = this.t.activity.find((x) => x.round_id === a.round_id && x.student_id === a.student_id);
    if (prev) Object.assign(prev, clone(a));
    else this.t.activity.push(clone(a));
  }
  async listActivity(contestId: string) {
    return clone(this.t.activity.filter((a) => a.contest_id === contestId));
  }

  /* images */
  async addImage(img: ImageRow) {
    this.t.images.push({ ...img, data: new Uint8Array(img.data) });
  }
  async getImage(id: string) {
    const i = this.t.images.find((x) => x.id === id);
    return i ? { ...i, data: new Uint8Array(i.data) } : null;
  }

  async ping() {}

  /* test hooks */
  async reset() {
    this.t = empty();
    this.seq = 0;
  }
  async seed(data: Partial<Dump>) {
    for (const [table, rows] of Object.entries(data) as [TableName, Record<string, unknown>[]][]) {
      const list = this.t[table] as unknown as Record<string, unknown>[];
      list.length = 0;
      for (const r of rows) {
        const row = { ...r };
        if (table === "submissions") {
          row.id = typeof row.id === "number" ? row.id : ++this.seq;
          this.seq = Math.max(this.seq, row.id as number);
          row.created_at ??= now();
          row.reason ??= null;
        }
        list.push(row);
      }
    }
  }
  async dump(): Promise<Dump> {
    const { images: _i, ...rest } = clone(this.t);
    return { ...rest, users: rest.users.map(publicUser) } as unknown as Dump;
  }
  async patch(table: TableName, id: string, set: Record<string, unknown>) {
    const row = (this.t[table] as unknown as Record<string, unknown>[]).find((x) => x.id === id);
    if (row) Object.assign(row, set);
  }
}

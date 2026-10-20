import { getStore, type Store } from "./store";
import { hashPassword } from "./password";
import { HttpError } from "./route";
import { clearContestCaches } from "../contest/server";
import { clearRankingCache } from "../contest/ranking";
import type { AdminContest, AdminTask, TestCase } from "../client/types";

/** Әкімші жазбаларынан кейін студенттер жаңа деректі ≤ 1 сұраныста көрсін. */
export function afterWrite() {
  clearContestCaches();
  clearRankingCache();
}

/** ADMIN_EMAIL / ADMIN_PASSWORD берілсе және мұндай аккаунт жоқ болса — әкімшіні құрады (бір рет). */
let bootstrapped = false;
export async function bootstrapAdmin(store: Store = getStore()) {
  if (bootstrapped) return;
  bootstrapped = true;
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!email || password.length < 8) return;
  if (await store.userByEmail(email)) return;
  await store.createUser({ email, password_hash: await hashPassword(password), role: "admin", last_name: "", first_name: "", full_name: "Әкімші", university: "", course: null, phone: null });
}

const STATUSES = ["draft", "published", "running", "finished"] as const;

export function contestPatch(b: Record<string, unknown>): Partial<AdminContest> {
  const p: Partial<AdminContest> = {};
  if (b.title !== undefined) {
    if (typeof b.title !== "string" || !b.title.trim() || b.title.length > 120) throw new HttpError(400, "Жарыстың атауы керек (≤ 120 таңба)");
    p.title = b.title.trim();
  }
  if (b.starts_at !== undefined) {
    if (typeof b.starts_at !== "string" || isNaN(Date.parse(b.starts_at))) throw new HttpError(400, "Басталу уақыты дұрыс емес");
    p.starts_at = new Date(b.starts_at).toISOString();
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status as never)) throw new HttpError(400, "Мұндай күй жоқ");
    p.status = b.status as AdminContest["status"];
  }
  if (b.board_locked !== undefined) p.board_locked = !!b.board_locked;
  if (b.board_autolock_min !== undefined) {
    const n = Number(b.board_autolock_min);
    if (!Number.isInteger(n) || n < 0 || n > 60) throw new HttpError(400, "Автожабу 0–60 минут");
    p.board_autolock_min = n;
  }
  return p;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
const tests = (v: unknown): TestCase[] =>
  Array.isArray(v) ? v.filter((t) => t && Array.isArray(t.args) && typeof t.expected === "string").map((t) => ({ args: t.args, expected: t.expected })) : [];
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.slice(0, 20_000)) : []);

/** Тапсырма денесін тазалау: тек белгілі өрістер, түрлері тексеріледі. partial=true — PATCH. */
export function taskInput(b: Record<string, unknown>, partial: boolean): Partial<Omit<AdminTask, "id">> {
  const t: Partial<Omit<AdminTask, "id">> = {};
  const has = (k: string) => b[k] !== undefined;
  if (!partial || has("round_id")) {
    if (typeof b.round_id !== "string" || !b.round_id) throw new HttpError(400, "Кезең көрсетілмеген");
    t.round_id = b.round_id;
  }
  if (!partial || has("idx")) {
    const n = Number(b.idx);
    if (!Number.isInteger(n) || n < 1 || n > 999) throw new HttpError(400, "Реттік нөмір 1–999");
    t.idx = n;
  }
  if (!partial || has("title")) {
    if (typeof b.title !== "string" || !b.title.trim()) throw new HttpError(400, "Тапсырманың атауы керек");
    t.title = b.title.trim().slice(0, 200);
  }
  if (!partial || has("points")) {
    const n = b.points === undefined ? 1 : Number(b.points);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new HttpError(400, "Ұпай 0–100");
    t.points = n;
  }
  if (!partial || has("statement")) t.statement = str(b.statement, 20_000) ?? "";
  if (!partial || has("variant")) {
    if (b.variant != null && b.variant !== "A" && b.variant !== "B") throw new HttpError(400, "Нұсқа A, B не бос");
    t.variant = (b.variant as "A" | "B" | null) ?? null;
  }
  if (!partial || has("options")) {
    t.options = Array.isArray(b.options)
      ? b.options.filter((o) => o && typeof o.key === "string" && typeof o.text === "string").map((o) => ({ key: o.key.slice(0, 4), text: o.text.slice(0, 2000) }))
      : null;
  }
  for (const k of ["correct", "starter_code", "solution_code", "image_url", "entry"] as const) if (!partial || has(k)) t[k] = str(b[k], 20_000);
  if (!partial || has("max_changed_lines")) t.max_changed_lines = b.max_changed_lines == null ? null : Math.max(1, Math.min(10, Number(b.max_changed_lines) || 1));
  if (!partial || has("forbidden")) t.forbidden = strings(b.forbidden);
  if (!partial || has("ai_refs")) t.ai_refs = strings(b.ai_refs);
  if (!partial || has("tests_public")) t.tests_public = tests(b.tests_public);
  if (!partial || has("tests_hidden")) t.tests_hidden = tests(b.tests_hidden);
  return t;
}

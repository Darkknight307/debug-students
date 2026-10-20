import { getStore } from "../server/store";
import { GRACE_MS, isBoardLocked, publicTask, roundWindow, type RoundWindow } from "./logic";
import type { AdminContest, AdminRound, AdminTask, Kind } from "../client/types";

/**
 * Жарыстың сервер жағындағы күйі (Store арқылы). 500 студент бірнеше секунд сайын сұрайтындықтан,
 * жарыс/кезең/тапсырма деректері инстанс ішінде бірнеше секундқа кэштеледі:
 * оператор кезеңді бастаса, студенттерге ≤3 секундта жетеді. Әкімші жазбалары кэшті тазалайды.
 */
export { GRACE_MS, isBoardLocked, publicTask, roundWindow };
export type { Kind, RoundWindow };
export type ContestRow = AdminContest;
export type RoundRow = AdminRound;
export type TaskRow = AdminTask;

const g = globalThis as unknown as { __debugMemo?: Map<string, { at: number; v: Promise<unknown> }> };
const variantMemo = new Map<string, "A" | "B">();
const memo = () => (g.__debugMemo ??= new Map());

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = memo().get(key);
  if (hit && now - hit.at < ttlMs) return hit.v as Promise<T>;
  const v = fn();
  memo().set(key, { at: now, v });
  v.catch(() => memo().delete(key));
  return v;
}

/** Әкімші өзгерткенде (жарыс, кезең, тапсырма, ұзарту) — келесі сұраныс жаңа дерек алады. */
export function clearContestCaches() {
  memo().clear();
  variantMemo.clear();
}

/** Ағымдағы жарыс: алдымен «жүріп жатыр» (ең кеші), болмаса ең жақын «жарияланды». */
export function currentContest(): Promise<ContestRow | null> {
  return cached("contest", 3_000, async () => {
    const all = await getStore().listContests();
    const running = all.filter((c) => c.status === "running").sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0];
    if (running) return running;
    return all.filter((c) => c.status === "published").sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null;
  });
}

export function contestRounds(contestId: string): Promise<RoundRow[]> {
  return cached(`rounds:${contestId}`, 2_000, () => getStore().listRounds(contestId));
}

/** Тапсырмалар жауап кілттерімен бірге — тек серверде, сыртқа publicTask арқылы шығады. */
export function roundTasks(roundId: string): Promise<TaskRow[]> {
  return cached(`tasks:${roundId}`, 10_000, () => getStore().listTasks([roundId]));
}

function roundExtensions(roundIds: string[]): Promise<Map<string, number>> {
  const key = `ext:${[...roundIds].sort().join(",")}`;
  return cached(key, 5_000, async () => {
    const out = new Map<string, number>();
    if (!roundIds.length) return out;
    for (const r of await getStore().listExtensions(roundIds)) out.set(`${r.round_id}:${r.student_id}`, r.extra_min);
    return out;
  });
}

export type Context = { contest: ContestRow; rounds: RoundRow[]; windows: RoundWindow[]; active: RoundWindow | null };

export async function loadContext(studentId: string, now = Date.now()): Promise<Context | null> {
  const contest = await currentContest();
  if (!contest) return null;
  const rounds = await contestRounds(contest.id);
  const ext = await roundExtensions(rounds.map((r) => r.id));
  const windows = rounds.map((r) => roundWindow(r, ext.get(`${r.id}:${studentId}`) ?? 0, now));
  return { contest, rounds, windows, active: windows.find((w) => w.state === "open") ?? null };
}

/** Кезең ауысқан сәтте (грейс кезінде) екі кезең қатар ашық болуы мүмкін — сондықтан бәрін қараймыз. */
export async function findOpenTask(ctx: Context, taskId: string): Promise<{ window: RoundWindow; task: TaskRow } | null> {
  for (const w of ctx.windows) {
    if (w.state !== "open") continue;
    const task = (await roundTasks(w.round.id)).find((t) => t.id === taskId);
    if (task) return { window: w, task };
  }
  return null;
}


/** Trace A/B нұсқасы: алғаш сұралғанда кездейсоқ беріледі және сол жарыста өзгермейді (бірінші жазба жеңеді). */
export async function variantFor(contestId: string, studentId: string): Promise<"A" | "B"> {
  const key = `${contestId}:${studentId}`;
  const hit = variantMemo.get(key);
  if (hit) return hit;
  const store = getStore();
  const v =
    (await store.getVariant(contestId, studentId)) ??
    (await store.addVariantIfAbsent({ contest_id: contestId, student_id: studentId, variant: Math.random() < 0.5 ? "A" : "B" }));
  variantMemo.set(key, v.variant);
  return v.variant;
}

/* ---------------- жіберу жиілігі ---------------- */

const lastHit = new Map<string, number>();

/** Бір студент бір тапсырмаға тым жиі жібермесін (инстанс ішінде). */
export function tooFast(key: string, minGapMs: number, now = Date.now()): boolean {
  const prev = lastHit.get(key) ?? 0;
  if (now - prev < minGapMs) return true;
  lastHit.set(key, now);
  if (lastHit.size > 20_000) for (const [k, t] of lastHit) if (now - t > 60_000) lastHit.delete(k);
  return false;
}

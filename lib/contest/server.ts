import { supabaseAdmin } from "../supabaseAdmin";

/**
 * Жарыстың сервер жағындағы күйі. 500 оқушы бірнеше секунд сайын сұрайтындықтан,
 * жарыс/кезең/тапсырма деректері инстанс ішінде бірнеше секундқа кэштеледі:
 * оператор кезеңді бастаса, оқушыларға ≤3 секундта жетеді.
 */

export type Kind = "mcq" | "debug" | "code";

export type ContestRow = {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  status: "draft" | "published" | "running" | "finished";
  board_locked: boolean;
  board_autolock_min: number;
};

export type RoundRow = {
  id: string;
  contest_id: string;
  idx: number;
  kind: Kind;
  title: string;
  duration_min: number;
  status: "pending" | "running" | "closed";
  started_at: string | null;
  ends_at: string | null;
};

export type TestCase = { args: unknown[]; expected: string };

export type TaskRow = {
  id: string;
  round_id: string;
  idx: number;
  title: string;
  statement: string;
  points: number;
  options: { key: string; text: string }[] | null;
  correct: string | null;
  starter_code: string | null;
  entry: string | null;
  max_changed_lines: number | null;
  forbidden: string[] | null;
  variant: "A" | "B" | null;
  image_url: string | null;
  tests_public: TestCase[] | null;
  tests_hidden: TestCase[] | null;
};

export type RoundWindow = { round: RoundRow; state: "pending" | "open" | "closed"; endsAt: number | null };

/** Желі кідірісіне: уақыт біткеннен кейін 5 секунд ішінде келген жіберілім қабылданады. */
export const GRACE_MS = 5_000;

const CONTEST_COLS = "id, slug, title, starts_at, status, board_locked, board_autolock_min";
const ROUND_COLS = "id, contest_id, idx, kind, title, duration_min, status, started_at, ends_at";
const TASK_COLS =
  "id, round_id, idx, title, statement, points, options, correct, starter_code, entry, max_changed_lines, forbidden, variant, image_url, tests_public, tests_hidden";

/* ---------------- қысқа кэш ---------------- */

const memo = new Map<string, { at: number; v: Promise<unknown> }>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && now - hit.at < ttlMs) return hit.v as Promise<T>;
  const v = fn();
  memo.set(key, { at: now, v });
  v.catch(() => memo.delete(key));
  return v;
}

/* ---------------- деректер ---------------- */

/** Ағымдағы жарыс: алдымен «жүріп жатыр», болмаса ең жақын «жарияланған». */
export function currentContest(): Promise<ContestRow | null> {
  return cached("contest", 3_000, async () => {
    const db = supabaseAdmin();
    const running = await db
      .from("contests")
      .select(CONTEST_COLS)
      .eq("status", "running")
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (running.error) throw new Error(running.error.message);
    if (running.data) return running.data as ContestRow;
    const published = await db
      .from("contests")
      .select(CONTEST_COLS)
      .eq("status", "published")
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (published.error) throw new Error(published.error.message);
    return (published.data as ContestRow) ?? null;
  });
}

export function contestRounds(contestId: string): Promise<RoundRow[]> {
  return cached(`rounds:${contestId}`, 2_000, async () => {
    const { data, error } = await supabaseAdmin()
      .from("rounds")
      .select(ROUND_COLS)
      .eq("contest_id", contestId)
      .order("idx");
    if (error) throw new Error(error.message);
    return (data ?? []) as RoundRow[];
  });
}

/** Тапсырмалар жауап кілттерімен бірге — тек серверде қолданылады, сыртқа publicTask арқылы шығады. */
export function roundTasks(roundId: string): Promise<TaskRow[]> {
  return cached(`tasks:${roundId}`, 10_000, async () => {
    const { data, error } = await supabaseAdmin().from("tasks").select(TASK_COLS).eq("round_id", roundId).order("idx");
    if (error) throw new Error(error.message);
    return (data ?? []) as TaskRow[];
  });
}

/** Кезеңдер бойынша жеке қосымша минуттар (барлық оқушыныкі бір сұраныспен, 5 с кэш). */
function roundExtensions(roundIds: string[]): Promise<Map<string, number>> {
  const key = `ext:${[...roundIds].sort().join(",")}`;
  return cached(key, 5_000, async () => {
    const out = new Map<string, number>();
    if (!roundIds.length) return out;
    const { data, error } = await supabaseAdmin()
      .from("round_extensions")
      .select("round_id, student_id, extra_min")
      .in("round_id", roundIds);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) out.set(`${r.round_id}:${r.student_id}`, r.extra_min as number);
    return out;
  });
}

export function roundWindow(r: RoundRow, extraMin: number, now: number): RoundWindow {
  if (!r.started_at || !r.ends_at) return { round: r, state: "pending", endsAt: null };
  const endsAt = Date.parse(r.ends_at) + extraMin * 60_000;
  return { round: r, state: now < endsAt ? "open" : "closed", endsAt };
}

export type Context = {
  contest: ContestRow;
  rounds: RoundRow[];
  windows: RoundWindow[];
  /** Оқушы үшін ашық ең бірінші кезең (жеке +5 мин есепке алынған) */
  active: RoundWindow | null;
};

export async function loadContext(studentId: string, now = Date.now()): Promise<Context | null> {
  const contest = await currentContest();
  if (!contest) return null;
  const rounds = await contestRounds(contest.id);
  const ext = await roundExtensions(rounds.map((r) => r.id));
  const windows = rounds.map((r) => roundWindow(r, ext.get(`${r.id}:${studentId}`) ?? 0, now));
  return { contest, rounds, windows, active: windows.find((w) => w.state === "open") ?? null };
}

/**
 * Тапсырманы ашық кезеңдердің ішінен іздейді. Кезең ауысқан сәтте (грейс кезінде)
 * екі кезең қатар ашық болуы мүмкін — сондықтан тек «active»-пен шектелмейміз.
 */
export async function findOpenTask(ctx: Context, taskId: string): Promise<{ window: RoundWindow; task: TaskRow } | null> {
  for (const w of ctx.windows) {
    if (w.state !== "open") continue;
    const task = (await roundTasks(w.round.id)).find((t) => t.id === taskId);
    if (task) return { window: w, task };
  }
  return null;
}

const variantMemo = new Map<string, "A" | "B">();

/** Trace A/B нұсқасы: алғаш сұралғанда кездейсоқ беріледі және сол жарыста өзгермейді. */
export async function variantFor(contestId: string, studentId: string): Promise<"A" | "B"> {
  const key = `${contestId}:${studentId}`;
  const hit = variantMemo.get(key);
  if (hit) return hit;

  const db = supabaseAdmin();
  const read = async () => {
    const { data } = await db
      .from("contest_variants")
      .select("variant")
      .eq("contest_id", contestId)
      .eq("student_id", studentId)
      .maybeSingle();
    return (data?.variant as "A" | "B" | undefined) ?? null;
  };

  let v = await read();
  if (!v) {
    const pick = Math.random() < 0.5 ? "A" : "B";
    await db
      .from("contest_variants")
      .upsert({ contest_id: contestId, student_id: studentId, variant: pick }, { onConflict: "contest_id,student_id", ignoreDuplicates: true });
    v = (await read()) ?? pick; // қатар келген екі сұраныстың біріншісі жеңеді
  }
  variantMemo.set(key, v);
  return v;
}

/** Оқушыға жіберілетін тапсырма: correct, solution_code, tests_hidden ЕШҚАШАН шықпайды. */
export function publicTask(t: TaskRow, kind: Kind) {
  const base = { id: t.id, idx: t.idx, title: t.title, statement: t.statement, points: t.points };
  if (kind === "mcq") return { ...base, image_url: t.image_url, options: t.options ?? [] };
  return {
    ...base,
    starter_code: t.starter_code ?? "",
    entry: t.entry ?? "",
    max_changed_lines: kind === "debug" ? t.max_changed_lines ?? 1 : null,
    forbidden: t.forbidden ?? [],
    tests_public: t.tests_public ?? [],
  };
}

/** Соңғы 10 минутта (немесе әкімші қолмен жапса) лидерборд жабық. */
export function isBoardLocked(contest: ContestRow, rounds: RoundRow[], now = Date.now()): boolean {
  if (contest.board_locked) return true;
  const last = rounds.reduce<RoundRow | null>((a, r) => (!a || r.idx > a.idx ? r : a), null);
  if (!last || !last.started_at || !last.ends_at) return false;
  const end = Date.parse(last.ends_at);
  return now < end && now >= end - contest.board_autolock_min * 60_000;
}

/* ---------------- жіберу жиілігі ---------------- */

const lastHit = new Map<string, number>();

/** Бір оқушы бір тапсырмаға тым жиі жібермесін (инстанс ішінде). */
export function tooFast(key: string, minGapMs: number, now = Date.now()): boolean {
  const prev = lastHit.get(key) ?? 0;
  if (now - prev < minGapMs) return true;
  lastHit.set(key, now);
  if (lastHit.size > 20_000) for (const [k, t] of lastHit) if (now - t > 60_000) lastHit.delete(k);
  return false;
}

export type Kind = "mcq" | "debug" | "code";

export type RoundInfo = {
  id: string;
  idx: number;
  kind: Kind;
  title: string;
  durationMin: number;
  state: "pending" | "open" | "closed";
  endsAt: string | null;
};

export type TestCase = { args: unknown[]; expected: string };

export type McqTask = {
  id: string;
  idx: number;
  title: string;
  statement: string;
  points: number;
  image_url: string | null;
  options: { key: string; text: string }[];
};

export type CodeTask = {
  id: string;
  idx: number;
  title: string;
  statement: string;
  points: number;
  starter_code: string;
  entry: string;
  max_changed_lines: number | null;
  forbidden: string[];
  tests_public: TestCase[];
};

export type Mine = Record<string, { answer?: string; code?: string; verdict?: "correct" | "wrong" }>;

export type ActiveFull = {
  roundId: string;
  idx: number;
  kind: Kind;
  title: string;
  endsAt: string | null;
  variant: "A" | "B" | null;
  tasks: (McqTask | CodeTask)[];
  mine: Mine;
};

export type StateResponse = {
  ok: boolean;
  message?: string;
  serverNow: string;
  student: { fullName: string };
  contest: { id: string; title: string; status: string; startsAt: string } | null;
  rounds: RoundInfo[];
  active: { roundId: string; idx: number; kind: Kind } | ActiveFull | null;
  me: { rank: number | null; score: number; total: number } | null;
  boardLocked: boolean;
};

export const KIND_SHORT: Record<Kind, string> = { mcq: "Trace", debug: "Debug", code: "Build" };
export const KIND_HINT: Record<Kind, string> = {
  mcq: "Кодты оқып, нәтижесін таңда",
  debug: "Қатені тап — бір жолды түзет",
  code: "Функцияны өзің жаз",
};

/** Түсінікті қате хабарымен JSON POST. */
export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<{ status: number; data: T & { ok?: boolean; message?: string } }> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.status === 401) {
      window.location.href = "/login";
    }
    const data = await r.json().catch(() => ({ ok: false, message: "Сервер жауап бермеді" }));
    return { status: r.status, data };
  } catch {
    return { status: 0, data: { ok: false, message: "Интернет байланысы үзілді. Қайталап көріңіз." } as T & { ok: boolean; message: string } };
  }
}

/** JSON мәнін Python түрінде көрсету: null → None, true → True, 'жол'. */
export function pyRepr(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'";
  if (Array.isArray(v)) return "[" + v.map(pyRepr).join(", ") + "]";
  if (typeof v === "object") return "{" + Object.entries(v as Record<string, unknown>).map(([k, x]) => pyRepr(k) + ": " + pyRepr(x)).join(", ") + "}";
  return String(v);
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}

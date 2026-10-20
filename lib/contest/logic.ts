/**
 * Жарыстың таза логикасы — сервер де (lib/server), mockService та (lib/client/mock) қолданады,
 * сондықтан екеуінің мінезі бірдей. Мұнда дерекқор да, Node API де жоқ.
 */
import type { AdminContest, AdminRound, AdminTask, Kind, RankRow } from "../client/types";

/** Желі кідірісіне: уақыт біткеннен кейін 5 секунд ішінде келген жіберілім қабылданады. */
export const GRACE_MS = 5_000;

export type RoundWindow = { round: AdminRound; state: "pending" | "open" | "closed"; endsAt: number | null };

/** Кезеңнің студентке арналған терезесі (жеке қосымша минуттар есепке алынады). */
export function roundWindow(r: AdminRound, extraMin: number, now: number): RoundWindow {
  if (!r.started_at || !r.ends_at) return { round: r, state: "pending", endsAt: null };
  const endsAt = Date.parse(r.ends_at) + extraMin * 60_000;
  return { round: r, state: now < endsAt ? "open" : "closed", endsAt };
}

/** Соңғы N минутта (немесе әкімші қолмен жапса) лидерборд жабық. */
export function isBoardLocked(contest: Pick<AdminContest, "board_locked" | "board_autolock_min">, rounds: AdminRound[], now = Date.now()): boolean {
  if (contest.board_locked) return true;
  const last = rounds.reduce<AdminRound | null>((a, r) => (!a || r.idx > a.idx ? r : a), null);
  if (!last || !last.started_at || !last.ends_at) return false;
  const end = Date.parse(last.ends_at);
  return now < end && now >= end - contest.board_autolock_min * 60_000;
}

/** Студентке жіберілетін тапсырма: correct, solution_code, tests_hidden, ai_refs ЕШҚАШАН шықпайды. */
export function publicTask(t: AdminTask, kind: Kind) {
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

export type ScoredSubmission = {
  id: number;
  round_id: string;
  task_id: string;
  student_id: string;
  is_correct: boolean;
  points: number;
  created_at: string;
};

/**
 * Рейтинг (бұрынғы contest_ranking SQL функциясымен бірдей ереже):
 * әр тапсырманың СОҢҒЫ жіберілімі есептеледі; ұпай кемуімен; тең болса — соңғы дұрыс жауабы
 * ертерек болғаны жоғары; одан кейін аты бойынша. Жүріп жатқан Trace кезеңі есептелмейді.
 */
export function computeRanking(
  subs: ScoredSubmission[],
  rounds: Pick<AdminRound, "id" | "kind" | "status">[],
  nameOf: (studentId: string) => string,
): RankRow[] {
  const hidden = new Set(rounds.filter((r) => r.kind === "mcq" && r.status === "running").map((r) => r.id));
  const ordered = subs
    .filter((s) => !hidden.has(s.round_id))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id));
  const last = new Map<string, ScoredSubmission>();
  for (const s of ordered) last.set(`${s.task_id}:${s.student_id}`, s);

  const per = new Map<string, { score: number; last: string | null }>();
  for (const s of last.values()) {
    const p = per.get(s.student_id) ?? { score: 0, last: null };
    if (s.is_correct) {
      p.score += s.points;
      if (!p.last || s.created_at > p.last) p.last = s.created_at;
    }
    per.set(s.student_id, p);
  }
  const rows = [...per].map(([student_id, p]) => ({ student_id, name: nameOf(student_id), score: p.score, last_correct_at: p.last }));
  rows.sort(
    (a, b) =>
      b.score - a.score ||
      (a.last_correct_at ?? "~").localeCompare(b.last_correct_at ?? "~") ||
      a.name.localeCompare(b.name),
  );
  return rows.map((r, i) => ({ rank: i + 1, ...r, total: rows.length }));
}

/** Кезеңді бастау (бұрынғы admin_start_round): жарыстың басқа жүріп тұрған кезеңі жабылады. */
export function startRoundPatches(rounds: AdminRound[], roundId: string, now: number) {
  const target = rounds.find((r) => r.id === roundId);
  if (!target) return null;
  const patches: { id: string; patch: Partial<AdminRound> }[] = [];
  for (const r of rounds) {
    if (r.id !== roundId && r.status === "running") {
      const end = r.ends_at ? Math.min(Date.parse(r.ends_at), now) : now;
      patches.push({ id: r.id, patch: { status: "closed", ends_at: new Date(end).toISOString() } });
    }
  }
  patches.push({
    id: roundId,
    patch: { status: "running", started_at: new Date(now).toISOString(), ends_at: new Date(now + target.duration_min * 60_000).toISOString() },
  });
  return patches;
}

/** Бәріне +N минут (тек жүріп тұрған кезеңге). */
export function extendRoundPatch(r: AdminRound, minutes: number, now: number): Partial<AdminRound> | null {
  if (r.status !== "running" || !r.ends_at) return null;
  return { ends_at: new Date(Math.max(Date.parse(r.ends_at), now) + minutes * 60_000).toISOString() };
}

/** Кезеңді қазір аяқтау. */
export function closeRoundPatch(r: AdminRound, now: number): Partial<AdminRound> | null {
  if (r.status !== "running") return null;
  return { status: "closed", ends_at: new Date(r.ends_at ? Math.min(Date.parse(r.ends_at), now) : now).toISOString() };
}

/** Көпшілікке көрсетілетін аты: тек «Тегі Аты». */
export function publicName(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return parts.slice(0, 2).join(" ") || "Аты көрсетілмеген";
}

/** Экран бөліскенде толық көрінбесін. */
export function maskEmail(e: string): string {
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  return `${e.slice(0, Math.min(2, at))}•••${e.slice(at)}`;
}

export function maskPhone(p: string | null): string {
  const d = (p || "").replace(/\D/g, "");
  if (d.length < 4) return "—";
  return `••• ••• ${d.slice(-4, -2)} ${d.slice(-2)}`;
}

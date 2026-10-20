import type { NextRequest } from "next/server";
import { currentStudent } from "../../../../lib/currentStudent";
import { isServerConfigured } from "../../../../lib/server/auth";
import { getStore } from "../../../../lib/server/store";
import { isBoardLocked, loadContext, publicTask, roundTasks, variantFor } from "../../../../lib/contest/server";
import { ranking } from "../../../../lib/contest/ranking";
import { fail, ok } from "../../../../lib/contest/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/contest/state        — жеңіл сауалнама (кезеңдер, таймер, өз орның); кэштен қайтады
 * GET /api/contest/state?full=1 — қосымша белсенді кезеңнің тапсырмалары және соңғы жауаптарың
 */
export async function GET(req: NextRequest) {
  if (!isServerConfigured()) return fail(500, "Сервер әлі бапталмаған");
  const student = await currentStudent().catch(() => null);
  if (!student) return fail(401, "Алдымен сайтқа кіріңіз");

  const now = Date.now();
  const ctx = await loadContext(student.id, now);
  const base = { serverNow: new Date(now).toISOString(), student: { fullName: student.full_name } };
  if (!ctx) return ok({ ...base, contest: null, rounds: [], active: null, me: null, boardLocked: false });

  const { contest, rounds, windows, active } = ctx;
  const boardLocked = isBoardLocked(contest, rounds, now);

  let me: { rank: number | null; score: number; total: number } | null = null;
  if (!boardLocked) {
    try {
      const { rows } = await ranking(contest.id);
      const row = rows.find((r) => r.student_id === student.id);
      me = row ? { rank: row.rank, score: row.score, total: row.total } : { rank: null, score: 0, total: rows[0]?.total ?? 0 };
    } catch {
      me = null;
    }
  }

  const body: Record<string, unknown> = {
    ...base,
    contest: { id: contest.id, title: contest.title, status: contest.status, startsAt: contest.starts_at },
    rounds: windows.map((w) => ({
      id: w.round.id,
      idx: w.round.idx,
      kind: w.round.kind,
      title: w.round.title,
      durationMin: w.round.duration_min,
      state: w.state,
      endsAt: w.endsAt ? new Date(w.endsAt).toISOString() : null,
    })),
    active: active ? { roundId: active.round.id, idx: active.round.idx, kind: active.round.kind } : null,
    me,
    boardLocked,
  };

  if (req.nextUrl.searchParams.get("full") === "1" && active) {
    const kind = active.round.kind;
    const variant = kind === "mcq" ? await variantFor(contest.id, student.id) : null;
    const allTasks = await roundTasks(active.round.id);
    // Кезеңде A/B бөлінісі жоқ болса (бәріне бір нұсқа), оқушыға нұсқа әрпін көрсетпейміз
    const hasVariants = allTasks.some((t) => t.variant);
    const tasks = allTasks.filter((t) => kind !== "mcq" || !t.variant || t.variant === variant);

    const subs = (await getStore().listSubmissions({ studentIds: [student.id], taskIds: tasks.map((t) => t.id) })).reverse();

    const mine: Record<string, { answer?: string; code?: string; verdict?: "correct" | "wrong" }> = {};
    for (const s of subs ?? []) {
      if (mine[s.task_id]) continue; // соңғысы ғана
      mine[s.task_id] =
        kind === "mcq"
          ? { answer: s.answer ?? undefined } // Trace-те дұрыс-бұрысы айтылмайды
          : { code: s.code ?? undefined, verdict: s.is_correct ? "correct" : "wrong" };
    }

    body.active = {
      roundId: active.round.id,
      idx: active.round.idx,
      kind,
      title: active.round.title,
      endsAt: active.endsAt ? new Date(active.endsAt).toISOString() : null,
      variant: hasVariants ? variant : null,
      tasks: tasks.map((t) => publicTask(t, kind)),
      mine,
    };
  }

  return ok(body);
}

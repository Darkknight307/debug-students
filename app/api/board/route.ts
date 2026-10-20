import { NextResponse } from "next/server";
import { isServerConfigured } from "../../../lib/server/auth";
import { contestRounds, currentContest, isBoardLocked } from "../../../lib/contest/server";
import { ranking } from "../../../lib/contest/ranking";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type BoardRow = { rank: number; name: string; score: number };
export type BoardData = {
  ok: boolean;
  locked: boolean;
  rows: BoardRow[];
  total: number;
  updated: string;
  stale?: boolean;
  /** Жарыс жоқ не әлі басталмаған */
  idle?: boolean;
  /** Бос тізімнің себебі (мысалы Trace жүріп жатыр) — экранда көрсетіледі */
  note?: string;
};

function json(data: BoardData, xCache: string) {
  return NextResponse.json(data, {
    headers: { "x-cache": xCache, "Cache-Control": "no-store, max-age=0" },
  });
}

/**
 * Ағымдағы жарыс болса — Supabase рейтингі. Жарыс болмаса — бос тізім және «Жарыс әлі басталған жоқ».
 */
export async function GET() {
  const updated = new Date().toISOString();
  if (!isServerConfigured()) {
    return json({ ok: false, locked: false, rows: [], total: 0, updated }, "NOT-CONFIGURED");
  }
  try {
    const contest = await currentContest();
    if (!contest) {
      return json({ ok: true, idle: true, locked: false, rows: [], total: 0, updated, note: "Жарыс әлі басталған жоқ" }, "IDLE");
    }
    const rounds = await contestRounds(contest.id);
    if (isBoardLocked(contest, rounds)) {
      return json({ ok: true, locked: true, rows: [], total: 0, updated }, "LOCKED");
    }
    const { rows, stale } = await ranking(contest.id);
    const traceRunning = rounds.some((r) => r.kind === "mcq" && r.status === "running");
    const started = rounds.some((r) => r.status === "running" || r.status === "closed");
    return json(
      {
        ok: true,
        locked: false,
        rows: rows.slice(0, 10).map((r) => ({ rank: r.rank, name: r.name, score: r.score })),
        total: rows[0]?.total ?? 0,
        updated,
        ...(stale ? { stale: true } : {}),
        ...(!rows.length && traceRunning ? { note: "Trace жүріп жатыр — нәтиже кезең аяқталғанда ашылады" } : {}),
        ...(!rows.length && !started ? { idle: true, note: "Жарыс әлі басталған жоқ" } : {}),
      },
      stale ? "STALE" : "DB",
    );
  } catch (e) {
    console.error("[board] supabase:", (e as Error).message);
    return json({ ok: false, locked: false, rows: [], total: 0, updated }, "DB-ERROR");
  }
}

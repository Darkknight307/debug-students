import { supabaseAdmin } from "../supabaseAdmin";

export type RankRow = {
  rank: number;
  student_id: string;
  name: string;
  score: number;
  last_correct_at: string | null;
  total: number;
};

/**
 * Рейтинг (contest_ranking RPC) — 8 секундқа кэштеледі және қатар келген сұраныстар
 * бір RPC шақыруын күтеді. Лидерборд пен оқушының «өз орны» осыдан алынады.
 */
const TTL_MS = 8_000;
let cache: { id: string; at: number; rows: RankRow[] } | null = null;
let inflight: { id: string; p: Promise<RankRow[]> } | null = null;

export async function ranking(contestId: string): Promise<{ rows: RankRow[]; stale: boolean }> {
  const now = Date.now();
  if (cache && cache.id === contestId && now - cache.at < TTL_MS) return { rows: cache.rows, stale: false };

  if (!inflight || inflight.id !== contestId) {
    const p = (async () => {
      const { data, error } = await supabaseAdmin().rpc("contest_ranking", { p_contest: contestId });
      if (error) throw new Error(error.message);
      return (data ?? []) as RankRow[];
    })();
    inflight = { id: contestId, p };
    p.finally(() => {
      if (inflight?.p === p) inflight = null;
    }).catch(() => {});
  }

  try {
    const rows = await inflight.p;
    cache = { id: contestId, at: Date.now(), rows };
    return { rows, stale: false };
  } catch (e) {
    if (cache && cache.id === contestId) return { rows: cache.rows, stale: true };
    throw e;
  }
}

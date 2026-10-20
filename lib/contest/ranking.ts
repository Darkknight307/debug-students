import { getStore } from "../server/store";
import { computeRanking } from "./logic";
import { contestRounds } from "./server";
import type { RankRow } from "../client/types";

export type { RankRow };

/**
 * Рейтинг (бұрынғы contest_ranking SQL ережесі, lib/contest/logic.ts → computeRanking).
 * 8 секундқа кэштеледі; қатар келген сұраныстар бір есептеуді күтеді.
 */
const TTL_MS = 8_000;
let cache: { id: string; at: number; rows: RankRow[] } | null = null;
let inflight: { id: string; p: Promise<RankRow[]> } | null = null;

export async function computeContestRanking(contestId: string): Promise<RankRow[]> {
  const store = getStore();
  const [subs, rounds] = await Promise.all([store.listSubmissions({ contestId }), store.listRounds(contestId)]);
  const users = await store.usersByIds([...new Set(subs.map((s) => s.student_id))]);
  const names = new Map(users.map((u) => [u.id, u.full_name]));
  return computeRanking(subs, rounds, (id) => names.get(id) ?? "?");
}

export async function ranking(contestId: string): Promise<{ rows: RankRow[]; stale: boolean }> {
  const now = Date.now();
  if (cache && cache.id === contestId && now - cache.at < TTL_MS) return { rows: cache.rows, stale: false };
  if (!inflight || inflight.id !== contestId) {
    const p = (async () => {
      await contestRounds(contestId); // кезең күйі кэштен
      return computeContestRanking(contestId);
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

export function clearRankingCache() {
  cache = null;
}

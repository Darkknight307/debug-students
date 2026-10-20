import { adminRoute, json, HttpError } from "../../../../../../lib/server/route";
import { getStore } from "../../../../../../lib/server/store";
import { afterWrite } from "../../../../../../lib/server/admin";
import { startRoundPatches } from "../../../../../../lib/contest/logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Оператор әрекеті «start» (бұрынғы admin_start_round SQL функциясының ережесі, lib/contest/logic.ts). */
export const POST = adminRoute<{ id: string }>(async (_req, _a, { id }) => {
  const store = getStore();
  const round = await store.getRound(id);
  if (!round) throw new HttpError(404, "Кезең табылмады");
  const now = Date.now();
  const patches = startRoundPatches(await store.listRounds(round.contest_id), id, now)!;
  await store.updateRounds(patches);
  const contest = await store.getContest(round.contest_id);
  if (contest && (contest.status === "draft" || contest.status === "published")) await store.updateContest(contest.id, { status: "running" });
  afterWrite();
  return json({ round: await store.getRound(id) });
});

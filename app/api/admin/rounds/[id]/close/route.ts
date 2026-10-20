import { adminRoute, json, HttpError } from "../../../../../../lib/server/route";
import { getStore } from "../../../../../../lib/server/store";
import { afterWrite } from "../../../../../../lib/server/admin";
import { closeRoundPatch } from "../../../../../../lib/contest/logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Оператор әрекеті «close» (бұрынғы admin_close_round SQL функциясының ережесі, lib/contest/logic.ts). */
export const POST = adminRoute<{ id: string }>(async (_req, _a, { id }) => {
  const store = getStore();
  const round = await store.getRound(id);
  if (!round) throw new HttpError(404, "Кезең табылмады");
  const now = Date.now();
  const patch = closeRoundPatch(round, now);
  if (!patch) throw new HttpError(409, "Кезең қазір жүріп тұрған жоқ");
  await store.updateRounds([{ id, patch }]);
  afterWrite();
  return json({ round: await store.getRound(id) });
});

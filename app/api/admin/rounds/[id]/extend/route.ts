import { adminRoute, json, body, HttpError } from "../../../../../../lib/server/route";
import { getStore } from "../../../../../../lib/server/store";
import { afterWrite } from "../../../../../../lib/server/admin";
import { extendRoundPatch } from "../../../../../../lib/contest/logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Оператор әрекеті «extend» (бұрынғы admin_extend_round SQL функциясының ережесі, lib/contest/logic.ts). */
export const POST = adminRoute<{ id: string }>(async (req, _a, { id }) => {
  const store = getStore();
  const round = await store.getRound(id);
  if (!round) throw new HttpError(404, "Кезең табылмады");
  const now = Date.now();
  const minutes = Number((await body(req)).minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw new HttpError(400, "Минут 1–60 аралығында болсын");
  const patch = extendRoundPatch(round, minutes, now);
  if (!patch) throw new HttpError(409, "Кезең қазір жүріп тұрған жоқ");
  await store.updateRounds([{ id, patch }]);
  afterWrite();
  return json({ round: await store.getRound(id) });
});

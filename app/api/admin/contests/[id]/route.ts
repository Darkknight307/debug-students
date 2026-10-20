import { adminRoute, body, json, HttpError } from "../../../../../lib/server/route";
import { getStore } from "../../../../../lib/server/store";
import { afterWrite, contestPatch } from "../../../../../lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = adminRoute<{ id: string }>(async (_req, _a, { id }) => {
  const store = getStore();
  const contest = await store.getContest(id);
  if (!contest) throw new HttpError(404, "Жарыс табылмады");
  const rounds = await store.listRounds(id);
  return json({ contest, rounds, tasks: await store.listTasks(rounds.map((r) => r.id)) });
});

export const PATCH = adminRoute<{ id: string }>(async (req, _a, { id }) => {
  const contest = await getStore().updateContest(id, contestPatch(await body(req)));
  if (!contest) throw new HttpError(404, "Жарыс табылмады");
  afterWrite();
  return json({ contest });
});

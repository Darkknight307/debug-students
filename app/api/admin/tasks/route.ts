import { adminRoute, body, json, HttpError } from "../../../../lib/server/route";
import { getStore, isConflict } from "../../../../lib/server/store";
import { afterWrite, taskInput } from "../../../../lib/server/admin";
import type { AdminTask } from "../../../../lib/client/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = adminRoute(async (req) => {
  const input = taskInput(await body(req), false) as Omit<AdminTask, "id">;
  const store = getStore();
  if (!(await store.getRound(input.round_id))) throw new HttpError(404, "Кезең табылмады");
  try {
    const task = await store.createTask(input);
    afterWrite();
    return json({ task });
  } catch (e) {
    if (isConflict(e)) throw new HttpError(409, "Бұл реттік нөмір (және нұсқа) бұл кезеңде бұрыннан бар");
    throw e;
  }
});

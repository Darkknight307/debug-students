import { adminRoute, body, json, HttpError } from "../../../../../lib/server/route";
import { getStore, isConflict } from "../../../../../lib/server/store";
import { afterWrite, taskInput } from "../../../../../lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = adminRoute<{ id: string }>(async (req, _a, { id }) => {
  const patch = taskInput(await body(req), true);
  try {
    const task = await getStore().updateTask(id, patch);
    if (!task) throw new HttpError(404, "Тапсырма табылмады");
    afterWrite();
    return json({ task });
  } catch (e) {
    if (isConflict(e)) throw new HttpError(409, "Бұл реттік нөмір (және нұсқа) бұл кезеңде бұрыннан бар");
    throw e;
  }
});

/** Тапсырма өшіріледі; оның жіберілімдері тарих үшін қалады. */
export const DELETE = adminRoute<{ id: string }>(async (_req, _a, { id }) => {
  if (!(await getStore().deleteTask(id))) throw new HttpError(404, "Тапсырма табылмады");
  afterWrite();
  return json({});
});

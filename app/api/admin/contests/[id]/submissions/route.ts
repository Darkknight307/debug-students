import { adminRoute, body, json } from "../../../../../../lib/server/route";
import { getStore } from "../../../../../../lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 500) : []);

/** Қайта тексеру панелі: берілген студенттер мен тапсырмалардың жіберілімдері, ең жаңасы бірінші. */
export const POST = adminRoute<{ id: string }>(async (req, _a, { id }) => {
  const b = await body(req);
  const subs = await getStore().listSubmissions({ contestId: id, studentIds: ids(b.studentIds), taskIds: ids(b.taskIds) });
  return json({
    submissions: subs.reverse().map(({ id: sid, student_id, task_id, code, is_correct, created_at }) => ({ id: sid, student_id, task_id, code, is_correct, created_at })),
  });
});

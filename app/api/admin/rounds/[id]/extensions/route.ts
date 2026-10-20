import { adminRoute, body, json, HttpError } from "../../../../../../lib/server/route";
import { getStore } from "../../../../../../lib/server/store";
import { afterWrite } from "../../../../../../lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Интернеті үзілген студентке жеке +5 мин (ең көбі 60). */
export const POST = adminRoute<{ id: string }>(async (req, _a, { id }) => {
  const studentId = (await body(req)).studentId;
  if (typeof studentId !== "string" || !studentId) throw new HttpError(400, "Студент көрсетілмеген");
  const store = getStore();
  if (!(await store.getRound(id))) throw new HttpError(404, "Кезең табылмады");
  const student = await store.userById(studentId);
  if (!student || student.role !== "student") throw new HttpError(404, "Студент табылмады");
  const prev = (await store.listExtensions([id])).find((e) => e.student_id === studentId)?.extra_min ?? 0;
  const extra_min = Math.min(prev + 5, 60);
  await store.setExtension({ round_id: id, student_id: studentId, extra_min });
  afterWrite();
  return json({ extra_min });
});

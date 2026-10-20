import { currentStudent } from "../../../../lib/currentStudent";
import { isServerConfigured } from "../../../../lib/server/auth";
import { getStore } from "../../../../lib/server/store";
import { GRACE_MS, findOpenTask, loadContext, tooFast, variantFor } from "../../../../lib/contest/server";
import { fail, ok, readJson } from "../../../../lib/contest/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trace жауабы. Әр таңдау жаңа жіберілім; соңғысы есептеледі; дұрыс-бұрысы айтылмайды. */
export async function POST(req: Request) {
  if (!isServerConfigured()) return fail(500, "Сервер әлі бапталмаған");
  const student = await currentStudent().catch(() => null);
  if (!student) return fail(401, "Алдымен сайтқа кіріңіз");

  const body = await readJson(req);
  const taskId = typeof body?.taskId === "string" ? body.taskId : "";
  const choice = typeof body?.choice === "string" ? body.choice.trim().toLowerCase() : "";
  if (!taskId || !choice || choice.length > 4) return fail(400, "Жауап дұрыс жіберілмеді");
  if (tooFast(`ans:${student.id}:${taskId}`, 250)) return fail(429, "Тым жиі. Сәл күтіңіз.");

  const ctx = await loadContext(student.id, Date.now() - GRACE_MS);
  const found = ctx ? await findOpenTask(ctx, taskId) : null;
  if (!ctx || !found || found.window.round.kind !== "mcq") return fail(409, "Бұл кезең қазір ашық емес");
  const { task, window: active } = found;
  if (task.variant && task.variant !== (await variantFor(ctx.contest.id, student.id))) return fail(403, "Бұл сіздің нұсқаңыз емес");
  if (!(task.options ?? []).some((o) => o.key === choice)) return fail(400, "Мұндай жауап нұсқасы жоқ");

  const isCorrect = !!task.correct && choice === task.correct.toLowerCase();
  try {
    await getStore().addSubmission({
      contest_id: ctx.contest.id, round_id: active.round.id, task_id: task.id, student_id: student.id,
      answer: choice, code: null, is_correct: isCorrect, points: isCorrect ? task.points : 0, reason: null,
    });
  } catch (e) {
    console.error("[answer] insert:", (e as Error).message);
    return fail(500, "Жауап сақталмады. Қайталап көріңіз.");
  }
  return ok({ saved: true });
}

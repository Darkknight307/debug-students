import { currentStudent } from "../../../../lib/currentStudent";
import { isServerConfigured, supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { GRACE_MS, findOpenTask, loadContext, tooFast } from "../../../../lib/contest/server";
import { verifyChallenge } from "../../../../lib/contest/challenge";
import { checkCode, compareOutputs } from "../../../../lib/contest/rules";
import { fail, ok, readJson } from "../../../../lib/contest/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Debug/Build жіберілімі. Оқушы браузері жасырын кірістерде кодты орындап, шығыстарды жібереді;
 * сервер ережелерді (бір жол, тыйым салынған конструкция) қайта тексеріп, шығыстарды салыстырады.
 * Ережеге сай келмеген жіберілім САҚТАЛМАЙДЫ — алдыңғы дұрыс жауапты баспайды.
 */
export async function POST(req: Request) {
  if (!isServerConfigured()) return fail(500, "Сервер әлі бапталмаған");
  const student = await currentStudent().catch(() => null);
  if (!student) return fail(401, "Алдымен сайтқа кіріңіз");

  const body = await readJson(req);
  const taskId = typeof body?.taskId === "string" ? body.taskId : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const outputs = body?.outputs;
  if (!taskId) return fail(400, "Тапсырма көрсетілмеген");
  if (!Array.isArray(outputs) || outputs.length > 50 || !outputs.every((o) => typeof o === "string" && o.length <= 2_000)) {
    return fail(400, "Нәтижелер дұрыс жіберілмеді");
  }
  if (tooFast(`sub:${student.id}:${taskId}`, 1_500)) return fail(429, "Тым жиі. Сәл күтіңіз.");

  const c = verifyChallenge(body?.token);
  if (!c || c.sid !== student.id || c.tid !== taskId) return fail(400, "Тексеру мерзімі өтті. «Жіберу»-ді қайта басыңыз.");

  const ctx = await loadContext(student.id, Date.now() - GRACE_MS);
  const found = ctx ? await findOpenTask(ctx, taskId) : null;
  if (!ctx || !found || found.window.round.kind === "mcq") return fail(409, "Кезең уақыты аяқталды");
  const { task, window: active } = found;

  const rules = checkCode(
    { kind: active.round.kind as "debug" | "code", starter_code: task.starter_code, max_changed_lines: task.max_changed_lines, forbidden: task.forbidden },
    code,
  );
  if (!rules.ok) return fail(422, rules.message, { rejected: true, reason: rules.reason, changed: rules.changed });

  const hidden = task.tests_hidden ?? [];
  const expected = c.idx.map((i) => hidden[i]?.expected);
  if (expected.some((e) => typeof e !== "string")) return fail(409, "Тапсырма жаңартылды. «Жіберу»-ді қайта басыңыз.");

  const correct = compareOutputs(outputs, expected as string[]);
  const { error } = await supabaseAdmin().from("submissions").insert({
    contest_id: ctx.contest.id,
    round_id: active.round.id,
    task_id: task.id,
    student_id: student.id,
    answer: JSON.stringify(outputs).slice(0, 20_000),
    code,
    is_correct: correct,
    points: correct ? task.points : 0,
    reason: correct ? null : "wrong",
  });
  if (error) {
    console.error("[submit] insert:", error.message);
    return fail(500, "Жіберілім сақталмады. Қайталап көріңіз.");
  }
  return ok({ correct });
}

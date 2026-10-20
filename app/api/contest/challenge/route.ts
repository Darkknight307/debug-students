import { currentStudent } from "../../../../lib/currentStudent";
import { isServerConfigured } from "../../../../lib/server/auth";
import { findOpenTask, loadContext, tooFast } from "../../../../lib/contest/server";
import { pickIndices, signChallenge } from "../../../../lib/contest/challenge";
import { fail, ok, readJson } from "../../../../lib/contest/http";

const MAX_TESTS_PER_SUBMIT = 25;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Жасырын тесттердің кездейсоқ кірістерін береді. Дұрыс шығыстар серверде қалады. */
export async function POST(req: Request) {
  if (!isServerConfigured()) return fail(500, "Сервер әлі бапталмаған");
  const student = await currentStudent().catch(() => null);
  if (!student) return fail(401, "Алдымен сайтқа кіріңіз");

  const body = await readJson(req);
  const taskId = typeof body?.taskId === "string" ? body.taskId : "";
  if (!taskId) return fail(400, "Тапсырма көрсетілмеген");
  if (tooFast(`chal:${student.id}:${taskId}`, 1_500)) return fail(429, "Тым жиі. Сәл күтіңіз.");

  const ctx = await loadContext(student.id);
  const found = ctx ? await findOpenTask(ctx, taskId) : null;
  if (!found || found.window.round.kind === "mcq") return fail(409, "Бұл кезең қазір ашық емес");
  const { task } = found;
  const hidden = task.tests_hidden ?? [];
  if (!hidden.length) return fail(409, "Бұл тапсырмада тексеру тесттері әлі жоқ. Ұйымдастырушыға хабарласыңыз.");

  // 25-ке дейінгі жасырын тесттің бәрі тексеріледі (одан көп болса — кездейсоқ 25-і).
  // Аз тестпен тексерсек, жартылай дұрыс шешім қайта-қайта жіберіп, кездейсоқ өтіп кетуі мүмкін.
  const idx = pickIndices(hidden.length, MAX_TESTS_PER_SUBMIT);
  return ok({ token: signChallenge(student.id, task.id, idx), inputs: idx.map((i) => hidden[i].args) });
}

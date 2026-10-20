import { adminRoute, json, HttpError } from "../../../../../../lib/server/route";
import { getStore } from "../../../../../../lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ЖИ/көшіру талдауына керектің бәрі бір жауапта. Талдаудың өзі әкімшінің браузерінде, үкімсіз. */
export const GET = adminRoute<{ id: string }>(async (_req, _a, { id }) => {
  const store = getStore();
  const contest = await store.getContest(id);
  if (!contest) throw new HttpError(404, "Жарыс табылмады");
  const rounds = await store.listRounds(id);
  const [tasks, subs, activity] = await Promise.all([store.listTasks(rounds.map((r) => r.id)), store.listSubmissions({ contestId: id }), store.listActivity(id)]);
  const students = await store.usersByIds([...new Set(subs.map((s) => s.student_id))]);
  return json({
    title: contest.title,
    rounds: rounds.map(({ id: rid, idx, kind, started_at, ends_at }) => ({ id: rid, idx, kind, started_at, ends_at })),
    tasks,
    students: students.map((s) => ({ id: s.id, full_name: s.full_name })),
    subs: subs.map(({ id: sid, student_id, task_id, code, is_correct, points, created_at }) => ({ id: sid, student_id, task_id, code, is_correct, points, created_at })),
    activity: activity.map(({ student_id, round_id, data }) => ({ student_id, round_id, data })),
  });
});

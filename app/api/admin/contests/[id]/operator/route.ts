import { adminRoute, json } from "../../../../../../lib/server/route";
import { getStore } from "../../../../../../lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Оператор консолінің тірі сандары: жіберілімдер, Trace ашқан студенттер, жүріп тұрған кезеңдегі жеке ұзартулар. */
export const GET = adminRoute<{ id: string }>(async (_req, _a, { id }) => {
  const store = getStore();
  const running = (await store.listRounds(id)).find((r) => r.status === "running");
  const exts = running ? await store.listExtensions([running.id]) : [];
  const users = await store.usersByIds(exts.map((e) => e.student_id));
  const name = new Map(users.map((u) => [u.id, u.full_name]));
  return json({
    submissions: await store.countSubmissions(id),
    people: await store.countVariants(id),
    extensions: exts.map((e) => ({ student_id: e.student_id, extra_min: e.extra_min, name: name.get(e.student_id) ?? "?" })),
  });
});

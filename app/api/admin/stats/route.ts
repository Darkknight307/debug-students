import { adminRoute, json } from "../../../../lib/server/route";
import { getStore } from "../../../../lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Тіркелген студенттер және оқу орындары (регистр мен артық бос орындар ескерілмейді, ең жиі жазылуы көрсетіледі). */
export const GET = adminRoute(async () => {
  const students = await getStore().listStudents({ order: "newest" });
  const groups = new Map<string, { n: number; names: Map<string, number> }>();
  for (const s of students) {
    const name = (s.university || "—").replace(/\s+/g, " ").trim();
    const g = groups.get(name.toLowerCase()) ?? { n: 0, names: new Map() };
    g.n++;
    g.names.set(name, (g.names.get(name) ?? 0) + 1);
    groups.set(name.toLowerCase(), g);
  }
  const byUniversity = [...groups.values()]
    .map((g) => [[...g.names].sort((a, b) => b[1] - a[1])[0][0], g.n] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return json({ total: students.length, byUniversity });
});

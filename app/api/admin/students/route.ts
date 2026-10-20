import { adminRoute, json } from "../../../../lib/server/route";
import { getStore } from "../../../../lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Аты бойынша іздеу (≥ 2 таңба, ≤ 8 нәтиже). */
export const GET = adminRoute(async (req) => {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return json({ students: [] });
  const rows = await getStore().listStudents({ order: "name", nameLike: q.slice(0, 60), limit: 8 });
  return json({ students: rows.map((r) => ({ id: r.id, full_name: r.full_name })) });
});

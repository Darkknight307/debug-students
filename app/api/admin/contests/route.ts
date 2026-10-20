import { adminRoute, body, json, HttpError } from "../../../../lib/server/route";
import { getStore, isConflict } from "../../../../lib/server/store";
import { afterWrite } from "../../../../lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = adminRoute(async () => json({ contests: await getStore().listContests() }));

/** Жарыс + үш кезең (Trace 20, Debug 30, Build 20 мин). */
export const POST = adminRoute(async (req) => {
  const b = await body(req);
  const slug = typeof b.slug === "string" ? b.slug.trim() : "";
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const starts = typeof b.starts_at === "string" ? Date.parse(b.starts_at) : NaN;
  if (!slug || slug.length > 60 || !title || title.length > 120 || isNaN(starts)) throw new HttpError(400, "Кілт, атау және басталу уақыты керек");
  try {
    const contest = await getStore().createContest(
      { slug, title, starts_at: new Date(starts).toISOString(), status: "draft", board_locked: false, board_autolock_min: 10 },
      [
        { idx: 1, kind: "mcq", title: "Trace — кодты оқу", duration_min: 20, status: "pending", started_at: null, ends_at: null },
        { idx: 2, kind: "debug", title: "Debug — қатені түзет", duration_min: 30, status: "pending", started_at: null, ends_at: null },
        { idx: 3, kind: "code", title: "Build — өзің жаз", duration_min: 20, status: "pending", started_at: null, ends_at: null },
      ],
    );
    afterWrite();
    return json({ contest });
  } catch (e) {
    if (isConflict(e)) throw new HttpError(409, "Бұл кілтпен жарыс бұрыннан бар");
    throw e;
  }
});

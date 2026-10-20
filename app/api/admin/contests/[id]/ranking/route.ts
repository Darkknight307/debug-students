import { adminRoute, json } from "../../../../../../lib/server/route";
import { computeContestRanking } from "../../../../../../lib/contest/ranking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Толық рейтинг (лидерборд құлпын елемейді, кэшсіз). */
export const GET = adminRoute<{ id: string }>(async (_req, _a, { id }) => json({ rows: await computeContestRanking(id) }));

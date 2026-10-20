import { adminRoute, json } from "../../../../../lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = adminRoute(async (_req, admin) => json({ admin: { email: admin.email } }));

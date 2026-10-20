import { ADMIN_COOKIE, clearCookie } from "../../../../../lib/server/auth";
import { json } from "../../../../../lib/server/route";

export const runtime = "nodejs";

export async function POST() {
  return clearCookie(json({}), ADMIN_COOKIE);
}

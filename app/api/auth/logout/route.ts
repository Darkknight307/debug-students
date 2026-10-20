import { clearCookie } from "../../../../lib/server/auth";
import { SESSION_COOKIE } from "../../../../lib/session";
import { json } from "../../../../lib/server/route";

export const runtime = "nodejs";

export async function POST() {
  return clearCookie(json({}), SESSION_COOKIE);
}

import { NextResponse } from "next/server";
import { checkHealth } from "../../../lib/server/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Docker HEALTHCHECK, Compose, CI деплойы: 200 {ok, db: "up", version} не 503 {ok: false, db: "down"}. */
export async function GET() {
  const { status, body } = await checkHealth();
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

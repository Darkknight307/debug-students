import { NextResponse, type NextRequest } from "next/server";
import { isServerConfigured } from "../../../../lib/server/auth";
import { getStore } from "../../../../lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Күнделікті «тірі ме?» тексерісі: дерекқорға бір жеңіл сұраныс (Store.ping). Хостингтің cron-ы шақырады.
 *
 * CRON_SECRET айнымалысы қойылса, Vercel оны Authorization тақырыбында жібереді — тексереміз.
 * Қойылмаса да қауіп жоқ: жол тек бір санақ сұранысын жасайды, дерек қайтармайды.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!isServerConfigured()) return NextResponse.json({ ok: false, reason: "not-configured" }, { status: 500 });

  const t0 = Date.now();
  try {
    await getStore().ping();
  } catch (e) {
    console.error("[keepalive] db:", (e as Error).message);
    return NextResponse.json({ ok: false, reason: "db-unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true, ms: Date.now() - t0, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}

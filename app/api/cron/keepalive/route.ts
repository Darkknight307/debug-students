import { NextResponse, type NextRequest } from "next/server";
import { isServerConfigured, supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Supabase-ті «ояту». Тегін тарифте жобаға 7 күн сұраныс түспесе, Supabase оны
 * тоқтатып қояды (мекенжайы DNS-тен жоғалады) — сонда кіру де, жарыс та істемей қалады.
 * Vercel Cron осы жолды күніне бір рет шақырады (vercel.json), бір жеңіл сұраныс жеткілікті.
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
  const { error } = await supabaseAdmin().from("contests").select("id", { count: "exact", head: true });
  if (error) {
    // «fetch failed» = жоба тоқтап тұр немесе желі жоқ. Логта көрінуі керек.
    console.error("[keepalive] supabase:", error.message);
    return NextResponse.json({ ok: false, reason: "db-unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true, ms: Date.now() - t0, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}

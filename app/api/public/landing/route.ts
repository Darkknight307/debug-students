import { NextResponse } from "next/server";
import { isServerConfigured } from "../../../../lib/server/auth";
import { landingData } from "../../../../lib/server/landing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Басты бетке керек ашық дерек (кірусіз): ағымдағы жарыс және тіркелгендердің «Тегі Аты» тізімі (lib/server/landing.ts).
 * Серверде 15 с кэш, CDN-де де 15 с — мыңдаған кіруші бір сұранысқа түседі.
 */
export async function GET() {
  const fail = () => NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!isServerConfigured()) return fail();
  const data = await landingData();
  if (!data) return fail(); // ескі дерек те жоқ — басты бет өз әдепкі мәтінін көрсетеді
  return NextResponse.json(data, {
    // Браузер әр жолы сұрайды; ал Vercel CDN 15 с сақтайды — функция сирек шақырылады
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "CDN-Cache-Control": "public, s-maxage=15, stale-while-revalidate=120",
    },
  });
}

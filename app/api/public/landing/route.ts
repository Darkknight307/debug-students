import { NextResponse } from "next/server";
import { isServerConfigured } from "../../../../lib/server/auth";
import { getStore } from "../../../../lib/server/store";
import { currentContest } from "../../../../lib/contest/server";
import { publicName } from "../../../../lib/publicName";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Басты бетке керек ашық дерек (кірусіз):
 *   - ағымдағы жарыстың атауы мен басталу уақыты (әкімші панеліндегі жарыстан);
 *   - тіркелген студенттердің саны және «Тегі Аты» тізімі (ең жаңасы бірінші).
 *     students жолы тек email расталған соң құрылады — расталмаған тіркелу мұнда көрінбейді.
 * Email, телефон, оқу орны, auth id сияқты деректер осы жерден ЕШҚАШАН шықпайды.
 *
 * Жүктеме: жауап серверде 15 с кэштеледі, CDN-де де 15 с — мыңдаған кіруші бір сұранысқа түседі.
 */
const TTL_MS = 15_000;
const MAX_NAMES = 300;

type Payload = {
  ok: true;
  serverNow: string;
  contest: { title: string; startsAt: string; status: string } | null;
  students: { count: number; names: string[] };
};

let cache: { at: number; data: Payload } | null = null;
let inflight: Promise<Payload> | null = null;

async function build(): Promise<Payload> {
  const contest = await currentContest();
  const store = getStore();
  const [rows, count] = await Promise.all([store.listStudents({ order: "newest", limit: MAX_NAMES }), store.countStudents()]);
  const names = rows.map((r) => publicName(r.full_name));
  return {
    ok: true,
    serverNow: new Date().toISOString(),
    contest: contest ? { title: contest.title, startsAt: contest.starts_at, status: contest.status } : null,
    students: { count: count ?? names.length, names },
  };
}

export async function GET() {
  const fail = () => NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!isServerConfigured()) return fail();

  const now = Date.now();
  if (!cache || now - cache.at >= TTL_MS) {
    inflight ??= build().finally(() => {
      inflight = null;
    });
    try {
      cache = { at: Date.now(), data: await inflight };
    } catch (e) {
      console.error("[landing] db:", (e as Error).message);
      if (!cache) return fail(); // ескі дерек те жоқ — басты бет өз әдепкі мәтінін көрсетеді
    }
  }
  return NextResponse.json(cache!.data, {
    // Браузер әр жолы сұрайды; ал Vercel CDN 15 с сақтайды — функция сирек шақырылады
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "CDN-Cache-Control": "public, s-maxage=15, stale-while-revalidate=120",
    },
  });
}

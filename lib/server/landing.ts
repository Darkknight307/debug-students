import { getStore } from "./store";
import { currentContest } from "../contest/server";
import { publicName } from "../publicName";

/**
 * Басты бетке керек ашық дерек (кірусіз): ағымдағы жарыстың атауы мен уақыты, тіркелген студенттердің саны және
 * «Тегі Аты» тізімі. Email, телефон, оқу орны, id ЕШҚАШАН шықпайды.
 * Жүктеме: жауап серверде 15 с кэштеледі; әкімші жазбасынан кейін (afterWrite) кэш бірден тазарады.
 */
const TTL_MS = 15_000;
const MAX_NAMES = 300;

export type LandingPayload = {
  ok: true;
  serverNow: string;
  contest: { title: string; startsAt: string; status: string } | null;
  students: { count: number; names: string[] };
};

// globalThis-те: Next.js әр маршрутты бөлек бума етеді — afterWrite() басқа бумадан шақырылса да осы кэшті тазартсын (#84)
const g = globalThis as unknown as { __debugLanding?: { cache: { at: number; data: LandingPayload } | null; inflight: Promise<LandingPayload> | null } };
const state = () => (g.__debugLanding ??= { cache: null, inflight: null });

async function build(): Promise<LandingPayload> {
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

/** Кэштелген дерек; дерекқор қатесінде ескі кэш болса соны береді, жоқ болса null. */
export async function landingData(now = Date.now()): Promise<LandingPayload | null> {
  const st = state();
  if (!st.cache || now - st.cache.at >= TTL_MS) {
    st.inflight ??= build().finally(() => {
      st.inflight = null;
    });
    try {
      st.cache = { at: Date.now(), data: await st.inflight };
    } catch (e) {
      console.error("[landing] db:", (e as Error).message);
      if (!st.cache) return null;
    }
  }
  return st.cache.data;
}

export function clearLandingCache() {
  state().cache = null;
}

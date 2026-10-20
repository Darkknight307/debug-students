import crypto from "node:crypto";

/**
 * «Жіберу» кезіндегі жасырын тест кірістерінің қолтаңбалы таңдауы.
 * Сервер қай тесттерді бергенін еске сақтамайды: таңдау токеннің өзінде, HMAC-пен қорғалған.
 * Дұрыс шығыстар серверден ешқашан шықпайды.
 */

const TTL_SEC = 180;

export type Challenge = { sid: string; tid: string; idx: number[]; exp: number };

/** Сессия кілтінен бөлек кілт: сессия токенін челлендж ретінде қолдануға болмайды. */
function key(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is not set (min 32 chars)");
  return crypto.createHash("sha256").update("challenge:" + s).digest();
}

export function signChallenge(sid: string, tid: string, idx: number[], now = Date.now()): string {
  const c: Challenge = { sid, tid, idx, exp: Math.floor(now / 1000) + TTL_SEC };
  const body = Buffer.from(JSON.stringify(c)).toString("base64url");
  const mac = crypto.createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyChallenge(token: unknown, now = Date.now()): Challenge | null {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = crypto.createHmac("sha256", key()).update(body).digest();
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Challenge;
    if (typeof c.sid !== "string" || typeof c.tid !== "string" || typeof c.exp !== "number") return null;
    if (!Array.isArray(c.idx) || !c.idx.every((x) => Number.isInteger(x) && x >= 0)) return null;
    if (c.exp * 1000 < now) return null;
    return c;
  } catch {
    return null;
  }
}

/** 0..total-1 ішінен k кездейсоқ индекс (өсу ретімен). */
export function pickIndices(total: number, k: number, rnd: () => number = Math.random): number[] {
  const all = Array.from({ length: total }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, Math.min(k, total)).sort((x, y) => x - y);
}

import crypto from "node:crypto";

/**
 * DEBUG-тың өз сессиясы: HMAC-SHA256 қолтаңбасы бар шағын токен, httpOnly cookie-де.
 * Supabase Auth сессиясы (access/refresh токен) мұнда сақталмайды — ол тек кіру сәтінде құпия сөзді тексеруге керек.
 */

export const SESSION_COOKIE = "debug_session";
const MAX_AGE_SEC = 12 * 60 * 60;

export type SessionClaims = {
  sid: string; // students.id
  jid: string; // Supabase Auth қолданушы id (auth.users.id)
  exp: number; // unix секунд
};

function secret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is not set (min 32 chars)");
  return Buffer.from(s);
}

export function signSession(sid: string, jid: string, now = Date.now()): string {
  const claims: SessionClaims = { sid, jid, exp: Math.floor(now / 1000) + MAX_AGE_SEC };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifySession(token: string | undefined | null, now = Date.now()): SessionClaims | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = crypto.createHmac("sha256", secret()).update(body).digest();
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionClaims;
    if (typeof c.sid !== "string" || typeof c.jid !== "string" || typeof c.exp !== "number") return null;
    if (c.exp * 1000 < now) return null;
    return c;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SEC,
};

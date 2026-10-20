import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions, signSession, verifySession } from "../session";
import { getStore, type UserRow } from "./store";

/**
 * Сессиялар: HMAC-қолтаңбалы httpOnly cookie (lib/session.ts).
 *   debug_session — студент (jid = "student"), debug_admin — әкімші (jid = "admin").
 * Студенттің сессиясы ешқашан әкімшілік бермейді: әкімші cookie-і бөлек және рөл дерекқордан тексеріледі.
 */
export const ADMIN_COOKIE = "debug_admin";

/** Жарыс кезінде 500 студент бірнеше секунд сайын сұрайды — жол инстанс ішінде 60 с сақталады. */
const TTL_MS = 60_000;
const g = globalThis as unknown as { __debugUserCache?: Map<string, { at: number; row: UserRow }> };
const cache = () => (g.__debugUserCache ??= new Map());

export function forgetUser(id?: string) {
  if (id) cache().delete(id);
  else cache().clear();
}

async function userFromCookie(name: string, role: "student" | "admin"): Promise<UserRow | null> {
  const store = await cookies();
  let claims = null;
  try {
    claims = verifySession(store.get(name)?.value);
  } catch {
    return null; // SESSION_SECRET бапталмаған
  }
  if (!claims || claims.jid !== role) return null;
  const hit = cache().get(claims.sid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.row.role === role ? hit.row : null;
  const row = await getStore().userById(claims.sid);
  if (!row) return null;
  if (cache().size > 5_000) cache().clear();
  cache().set(claims.sid, { at: Date.now(), row });
  return row.role === role ? row : null;
}

export const currentStudent = () => userFromCookie(SESSION_COOKIE, "student");
export const currentAdmin = () => userFromCookie(ADMIN_COOKIE, "admin");

export function setStudentSession(res: NextResponse, userId: string) {
  res.cookies.set(SESSION_COOKIE, signSession(userId, "student"), sessionCookieOptions);
  return res;
}
export function setAdminSession(res: NextResponse, userId: string) {
  res.cookies.set(ADMIN_COOKIE, signSession(userId, "admin"), sessionCookieOptions);
  return res;
}
export function clearCookie(res: NextResponse, name: string) {
  res.cookies.set(name, "", { ...sessionCookieOptions, maxAge: 0 });
  return res;
}

export function isServerConfigured(): boolean {
  return !!process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32;
}

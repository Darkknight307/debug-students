import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isServerConfigured } from "../../../lib/supabaseAdmin";
import { clientIp, isAuthConfigured, supabaseAuth } from "../../../lib/supabaseAuth";
import { saveStudent } from "../../../lib/studentAccount";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Растау хатындағы сілтеме: /auth/confirm?token_hash=…&type=email
 * (Supabase → Authentication → Email Templates → «Confirm signup» үлгісінде осылай тұруы керек).
 * Сәтті болса — студент жолы құрылады, cookie беріледі, /me-ге бағыттаймыз.
 */
const TYPES: EmailOtpType[] = ["email", "signup"];

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const tokenHash = q.get("token_hash") || "";
  const type = (q.get("type") || "email") as EmailOtpType;
  const toLogin = (reason: string) => NextResponse.redirect(new URL(`/login?confirm=${reason}`, req.url), { status: 303 });

  if (!isServerConfigured() || !isAuthConfigured()) return toLogin("server");
  if (!tokenHash || tokenHash.length > 200 || !TYPES.includes(type)) return toLogin("invalid");

  const { data, error } = await supabaseAuth(clientIp(req)).auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return toLogin(error?.status === 0 || (error?.status ?? 0) >= 500 ? "server" : "expired");

  try {
    const student = await saveStudent(data.user);
    const res = NextResponse.redirect(new URL("/me?welcome=1", req.url), { status: 303 });
    res.cookies.set(SESSION_COOKIE, signSession(student.id, data.user.id), sessionCookieOptions);
    return res;
  } catch (e) {
    console.error("[auth] confirm:", (e as Error).message);
    // Email расталды, тек студент жолы сақталмады — кірген кезде қайта құрылады
    return toLogin("confirmed");
  }
}

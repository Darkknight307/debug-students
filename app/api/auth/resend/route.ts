import type { NextRequest } from "next/server";
import { clientIp, describeAuthError, isAuthConfigured, siteUrl, supabaseAuth } from "../../../../lib/supabaseAuth";
import { hit } from "../../../../lib/rateLimit";
import { isValidEmail, normalizeEmail } from "../../../../lib/registration";
import { fail, ok, readJson } from "../../../../lib/contest/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60_000;

/** Растау хатын қайта жіберу. Email тіркелген-тіркелмегеніне қарамай жауап бірдей. */
export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) return fail(500, "Сервер әлі бапталмаған. Ұйымдастырушыға хабарласыңыз.");
  const body = await readJson(req);
  if (!body) return fail(415, "JSON күтілді");
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return fail(400, "Email дұрыс емес");

  const ip = clientIp(req);
  if (hit("resend-ip:" + ip, 20, WINDOW_MS) || hit("resend:" + email, 3, WINDOW_MS)) {
    return fail(429, "Хат жақында жіберілген. Бірнеше минуттан кейін қайталаңыз.");
  }
  const { error } = await supabaseAuth(ip).auth.resend({ type: "signup", email, options: { emailRedirectTo: siteUrl(req) + "/auth/confirm" } });
  if (error) {
    const f = describeAuthError(error);
    if (f.status === 429 || f.status === 503) return fail(f.status, f.message);
    console.warn("[auth] resend:", f.code, error.status);
  }
  return ok({ sent: true });
}

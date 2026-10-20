import { createClient, isAuthApiError, isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

/**
 * Студенттердің Supabase Auth шақырулары — ТЕК серверде.
 * Браузерге Supabase сессиясы берілмейді: кіргеннен кейін біздің `debug_session` cookie-і қойылады,
 * сондықтан жарыс API-лары мен RLS бұрынғыдай қалады.
 *
 * Әр сұранысқа жаңа клиент: verifyOtp/signIn клиенттің жадына сессия жазады, ортақ клиентте
 * бір студенттің сессиясы екіншісінің сұранысына араласып кетуі мүмкін еді.
 *
 * IP шегі: Supabase Auth тіркелу мен кіруді IP бойынша шектейді, ал бұл шақырулардың бәрі Vercel
 * серверінен шығады. SUPABASE_SECRET_KEY (sb_secret_…) қойылса және жобада «IP Address Forwarding»
 * қосылса, студенттің өз IP-і `Sb-Forwarded-For` тақырыбымен жіберіледі. Кілт қойылмаса —
 * anon кілт, ал шекті Supabase → Authentication → Rate Limits-те көтеру керек.
 */

export function isAuthConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
}

export function clientIp(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

export function supabaseAuth(ip?: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const headers: Record<string, string> = {};
  if (secret && ip && ip !== "unknown") headers["sb-forwarded-for"] = ip;
  return createClient(url, secret || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers },
  });
}

/** Хаттағы сілтемелердің негізі: NEXT_PUBLIC_SITE_URL, ол болмаса — сұраныстың өз мекенжайы. */
export function siteUrl(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/+$/, "");
}

/** Хат жіберу (Custom SMTP) бапталғанын әкімші AUTH_EMAILS_ENABLED=1 арқылы білдіреді. */
export function emailsEnabled(): boolean {
  return process.env.AUTH_EMAILS_ENABLED === "1";
}

export type AuthFailure = { status: number; message: string; code: string };

/** Supabase Auth қатесі → студентке түсінікті қазақша хабар. Құпия сөз де, email де логқа жазылмайды. */
export function describeAuthError(e: unknown): AuthFailure {
  if (isAuthRetryableFetchError(e)) {
    return { status: 503, code: "unavailable", message: "Тіркелу қызметі уақытша жауап бермей тұр. Сәл кейін қайталаңыз." };
  }
  const code = isAuthApiError(e) ? e.code ?? "" : "";
  const status = isAuthApiError(e) ? e.status : 500;
  switch (code) {
    case "invalid_credentials":
      return { status: 401, code, message: "Email немесе құпия сөз қате." };
    case "email_not_confirmed":
      return { status: 403, code, message: "Email әлі расталмаған. Поштаңызға келген хаттағы сілтемені басыңыз." };
    case "user_already_exists":
    case "email_exists":
      return { status: 409, code, message: "Бұл email-мен бұрын тіркелгенсіз. «Кіру» қойындысынан кіріңіз." };
    case "weak_password":
      return { status: 400, code, message: "Құпия сөз тым әлсіз. Ұзынырақ, әріп пен цифр аралас құпия сөз ойлап табыңыз." };
    case "same_password":
      return { status: 400, code, message: "Жаңа құпия сөз бұрынғысынан өзгеше болуы керек." };
    case "email_address_invalid":
    case "email_address_not_authorized":
      return { status: 400, code, message: "Бұл email-ге хат жіберу мүмкін емес. Басқа адрес енгізіңіз." };
    case "signup_disabled":
    case "email_provider_disabled":
      return { status: 403, code, message: "Тіркелу уақытша жабық. Ұйымдастырушыға хабарласыңыз." };
    case "otp_expired":
    case "flow_state_expired":
      return { status: 400, code, message: "Сілтеменің мерзімі өтіп кеткен немесе ол бұрын қолданылған. Жаңа хат сұраңыз." };
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return { status: 429, code, message: "Сұраныс тым көп. Бірнеше минуттан кейін қайталаңыз." };
  }
  if (status === 429) return { status: 429, code: code || "rate_limit", message: "Сұраныс тым көп. Бірнеше минуттан кейін қайталаңыз." };
  return { status: status >= 500 ? 503 : 400, code: code || "unknown", message: "Әрекет орындалмады. Сәл кейін қайталап көріңіз." };
}

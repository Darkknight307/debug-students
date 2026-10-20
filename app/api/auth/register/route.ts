import type { NextRequest } from "next/server";
import { isServerConfigured } from "../../../../lib/supabaseAdmin";
import { clientIp, describeAuthError, isAuthConfigured, siteUrl, supabaseAuth } from "../../../../lib/supabaseAuth";
import { hit } from "../../../../lib/rateLimit";
import { profileToMetadata, validateRegistration } from "../../../../lib/registration";
import { StudentStoreError, saveStudent, withSession } from "../../../../lib/studentAccount";
import { fail, ok, readJson } from "../../../../lib/contest/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60_000;
// Компьютер сыныбынан бүкіл топ бір мезетте тіркелуі мүмкін — IP шегі жоғары, email шегі төмен
const IP_LIMIT = 40;
const EMAIL_LIMIT = 5;

/**
 * Тіркелу. Supabase-те «Confirm email» өшірулі болса — студент бірден кіреді (cookie беріледі).
 * Қосулы болса — Supabase растау хатын жібереді, студент жолы /auth/confirm-да құрылады.
 */
export async function POST(req: NextRequest) {
  if (!isServerConfigured() || !isAuthConfigured()) return fail(500, "Сервер әлі бапталмаған. Ұйымдастырушыға хабарласыңыз.");
  const body = await readJson(req);
  if (!body) return fail(415, "JSON күтілді");

  const v = validateRegistration(body);
  if (!v.ok) return fail(400, v.message, { field: v.field });
  const { email, password, ...profile } = v.value;

  const ip = clientIp(req);
  if (hit("reg-ip:" + ip, IP_LIMIT, WINDOW_MS) || hit("reg:" + email, EMAIL_LIMIT, WINDOW_MS)) {
    return fail(429, "Тым көп әрекет. 10 минуттан кейін қайталаңыз.");
  }

  const { data, error } = await supabaseAuth(ip).auth.signUp({
    email,
    password,
    options: { data: profileToMetadata(profile), emailRedirectTo: siteUrl(req) + "/auth/confirm" },
  });
  if (error || !data.user) {
    const f = describeAuthError(error);
    if (f.status >= 500 || f.code === "unknown") console.warn("[auth] signup:", f.code, error?.status);
    return fail(f.status, f.message, f.code === "user_already_exists" || f.code === "email_exists" ? { field: "email" } : {});
  }

  // Растау қосулы: хат жіберілді. Email бұрын тіркелген болса да Supabase дәл осындай жауап береді —
  // бөтен адам «бұл email бар ма?» деп тексере алмауы үшін біз де айырмашылық көрсетпейміз.
  if (!data.session) return ok({ needsConfirm: true });

  try {
    const student = await saveStudent(data.user, profile);
    return withSession(ok({ loggedIn: true, student: { fullName: student.full_name } }), student, data.user.id);
  } catch (e) {
    console.error("[auth] students upsert (register):", (e as Error).message);
    if (e instanceof StudentStoreError && e.unreachable) {
      return fail(503, "Аккаунт құрылды, бірақ DEBUG дерекқоры уақытша қолжетімсіз. Сәл кейін «Кіру» қойындысынан кіріңіз.");
    }
    return fail(500, "Аккаунт құрылды, бірақ тізімге қосылмады. «Кіру» қойындысынан кіріп көріңіз.");
  }
}

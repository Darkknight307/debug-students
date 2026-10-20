import type { NextRequest } from "next/server";
import { isServerConfigured } from "../../../../lib/supabaseAdmin";
import { clientIp, describeAuthError, isAuthConfigured, supabaseAuth } from "../../../../lib/supabaseAuth";
import { clearFailures, recordFailure, tooManyFailures } from "../../../../lib/rateLimit";
import { isValidEmail, normalizeEmail } from "../../../../lib/registration";
import { NotAStudentError, StudentStoreError, saveStudent, withSession } from "../../../../lib/studentAccount";
import { fail, ok, readJson } from "../../../../lib/contest/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60_000;
const USER_LIMIT = 8;
// Университет не жатақхана желісінде ондаған студент бір IP-ден шығады — IP шегі әдейі жоғары
const IP_LIMIT = 60;

export async function POST(req: NextRequest) {
  // Бапталмаған серверге студент паролін жібермейміз
  if (!isServerConfigured() || !isAuthConfigured()) return fail(500, "Сервер әлі бапталмаған. Ұйымдастырушыға хабарласыңыз.");

  // Тек JSON: қарапайым HTML-формамен жасалатын CSRF шабуылын жабады
  const body = await readJson(req);
  if (!body) return fail(415, "JSON күтілді");
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return fail(400, "Email мен құпия сөзді енгізіңіз");
  if (email.length > 254 || password.length > 256) return fail(400, "Email немесе құпия сөз тым ұзын");
  if (!isValidEmail(email)) return fail(400, "Email дұрыс емес");

  const ip = clientIp(req);
  const userKey = "login:" + email;
  const ipKey = "login-ip:" + ip;
  if (tooManyFailures(userKey, USER_LIMIT) || tooManyFailures(ipKey, IP_LIMIT)) {
    return fail(429, "Тым көп сәтсіз әрекет. 10 минуттан кейін қайталаңыз.");
  }

  const { data, error } = await supabaseAuth(ip).auth.signInWithPassword({ email, password });
  // Құпия сөз осы жолдан кейін қолданылмайды және ешқайда жазылмайды; Supabase сессиясы да сақталмайды.
  if (error || !data.user) {
    const f = describeAuthError(error);
    if (f.code === "invalid_credentials") {
      recordFailure(userKey, WINDOW_MS);
      recordFailure(ipKey, WINDOW_MS);
    } else {
      console.warn("[auth] login:", f.code, error?.status);
    }
    return fail(f.status, f.message, f.code === "email_not_confirmed" ? { unconfirmed: true } : {});
  }
  clearFailures(userKey);

  try {
    const student = await saveStudent(data.user);
    return withSession(ok({ student: { fullName: student.full_name } }), student, data.user.id);
  } catch (e) {
    if (e instanceof NotAStudentError) return fail(403, "Бұл аккаунт студент ретінде тіркелмеген. Сайтта тіркеліңіз.");
    console.error("[auth] students upsert:", (e as Error).message);
    // Логин мен құпия сөз дұрыс (Supabase қабылдады) — мәселе біздің дерекқорда.
    // Студент «паролім қате» деп ойламауы үшін себебін ашық айтамыз.
    if (e instanceof StudentStoreError && e.unreachable) {
      return fail(503, "Email мен құпия сөз дұрыс, бірақ DEBUG дерекқоры уақытша қолжетімсіз. Ұйымдастырушыға хабарласыңыз.");
    }
    return fail(500, "Email мен құпия сөз дұрыс, бірақ кіру сақталмады. Қайталап көріңіз.");
  }
}

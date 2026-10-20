import type { NextRequest } from "next/server";
import { getStore } from "../../../../lib/server/store";
import { verifyPassword } from "../../../../lib/server/password";
import { forgetUser, isServerConfigured, setStudentSession } from "../../../../lib/server/auth";
import { HttpError, body, json, route } from "../../../../lib/server/route";
import { clearFailures, recordFailure, tooManyFailures } from "../../../../lib/rateLimit";
import { isValidEmail, normalizeEmail } from "../../../../lib/registration";
import { clientIp } from "../../../../lib/server/ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60_000;
const USER_LIMIT = 8;
// Университет желісінде ондаған студент бір IP-ден шығады — IP шегі әдейі жоғары
const IP_LIMIT = 60;

export const POST = route(async (req: NextRequest) => {
  // Бапталмаған серверге студент паролін жібермейміз
  if (!isServerConfigured()) throw new HttpError(500, "Сервер әлі бапталмаған. Ұйымдастырушыға хабарласыңыз.");
  const b = await body(req); // тек JSON: HTML-формамен жасалатын CSRF-ті жабады
  const email = normalizeEmail(b.email);
  const password = typeof b.password === "string" ? b.password : "";
  if (!email || !password) throw new HttpError(400, "Email мен құпия сөзді енгізіңіз");
  if (email.length > 254 || password.length > 256) throw new HttpError(400, "Email немесе құпия сөз тым ұзын");
  if (!isValidEmail(email)) throw new HttpError(400, "Email дұрыс емес");

  const ip = clientIp(req);
  const userKey = "login:" + email;
  const ipKey = "login-ip:" + ip;
  if (tooManyFailures(userKey, USER_LIMIT) || tooManyFailures(ipKey, IP_LIMIT)) {
    throw new HttpError(429, "Тым көп сәтсіз әрекет. 10 минуттан кейін қайталаңыз.");
  }
  const store = getStore();
  const user = await store.userByEmail(email);
  // Құпия сөз осы жолдан кейін қолданылмайды және ешқайда жазылмайды
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    recordFailure(userKey, WINDOW_MS);
    recordFailure(ipKey, WINDOW_MS);
    throw new HttpError(401, "Email немесе құпия сөз қате.");
  }
  clearFailures(userKey);
  if (user.role !== "student") throw new HttpError(403, "Бұл аккаунт студент ретінде тіркелмеген. Сайтта тіркеліңіз.");
  await store.updateUser(user.id, { last_login_at: new Date().toISOString() });
  forgetUser(user.id);
  return setStudentSession(json({ student: { fullName: user.full_name } }), user.id);
});

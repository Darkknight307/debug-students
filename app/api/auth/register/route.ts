import type { NextRequest } from "next/server";
import { getStore, isConflict } from "../../../../lib/server/store";
import { hashPassword } from "../../../../lib/server/password";
import { isServerConfigured, setStudentSession } from "../../../../lib/server/auth";
import { HttpError, body, json, route } from "../../../../lib/server/route";
import { hit } from "../../../../lib/rateLimit";
import { fullNameOf, validateRegistration } from "../../../../lib/registration";
import { clientIp } from "../../../../lib/server/ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60_000;
// Компьютер сыныбынан бүкіл топ бір мезетте тіркелуі мүмкін — IP шегі жоғары, email шегі төмен
const IP_LIMIT = 40;
const EMAIL_LIMIT = 5;

/** Тіркелу: тексеру → scrypt хэш → users (role=student) → debug_session. Email растау MVP-де жоқ (#49). */
export const POST = route(async (req: NextRequest) => {
  if (!isServerConfigured()) throw new HttpError(500, "Сервер әлі бапталмаған. Ұйымдастырушыға хабарласыңыз.");
  const v = validateRegistration(await body(req));
  if (!v.ok) throw new HttpError(400, v.message, { field: v.field });
  const { email, password, ...p } = v.value;
  const ip = clientIp(req);
  if (hit("reg-ip:" + ip, IP_LIMIT, WINDOW_MS) || hit("reg:" + email, EMAIL_LIMIT, WINDOW_MS)) {
    throw new HttpError(429, "Тым көп әрекет. 10 минуттан кейін қайталаңыз.");
  }
  try {
    const user = await getStore().createUser({
      email, password_hash: await hashPassword(password), role: "student",
      last_name: p.lastName, first_name: p.firstName, full_name: fullNameOf(p.lastName, p.firstName),
      university: p.university, course: p.course, phone: p.phone,
    });
    return setStudentSession(json({ loggedIn: true, student: { fullName: user.full_name } }), user.id);
  } catch (e) {
    if (isConflict(e)) throw new HttpError(409, "Бұл email-мен бұрын тіркелгенсіз. «Кіру» қойындысынан кіріңіз.", { field: "email" });
    throw e;
  }
});

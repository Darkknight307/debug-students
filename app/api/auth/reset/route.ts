import type { NextRequest } from "next/server";
import { getStore } from "../../../../lib/server/store";
import { hashPassword, sha256, verifyPassword } from "../../../../lib/server/password";
import { forgetUser, isServerConfigured, setStudentSession } from "../../../../lib/server/auth";
import { HttpError, body, json, route } from "../../../../lib/server/route";
import { hit } from "../../../../lib/rateLimit";
import { validatePassword } from "../../../../lib/registration";
import { clientIp } from "../../../../lib/server/ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPIRED = "Сілтеменің мерзімі өтіп кеткен немесе ол бұрын қолданылған. Жаңа хат сұраңыз.";

/** Жаңа құпия сөз: токен батырма басылғанда ғана жұмсалады (пошта сканерлері сілтемені ашса да жұмсалмайды). */
export const POST = route(async (req: NextRequest) => {
  if (!isServerConfigured()) throw new HttpError(500, "Сервер әлі бапталмаған. Ұйымдастырушыға хабарласыңыз.");
  const b = await body(req);
  const token = typeof b.tokenHash === "string" ? b.tokenHash.trim() : "";
  if (!token || token.length > 200) throw new HttpError(400, "Сілтеме толық емес. Хаттағы сілтемені қайта ашыңыз.");
  const bad = validatePassword(b.password);
  if (bad) throw new HttpError(400, bad.message, { field: "password" });
  if (hit("reset-ip:" + clientIp(req), 30, 10 * 60_000)) throw new HttpError(429, "Тым көп әрекет. 10 минуттан кейін қайталаңыз.");

  const store = getStore();
  const t = await store.takeResetToken(sha256(token));
  if (!t || Date.parse(t.expires_at) < Date.now()) throw new HttpError(400, EXPIRED);
  const user = await store.userById(t.user_id);
  const secret = user && (await store.userByEmail(user.email));
  if (!user || !secret) throw new HttpError(400, EXPIRED);
  if (await verifyPassword(b.password as string, secret.password_hash)) {
    throw new HttpError(400, "Жаңа құпия сөз бұрынғысынан өзгеше болуы керек.", { field: "password" });
  }
  await store.updateUser(user.id, { password_hash: await hashPassword(b.password as string), last_login_at: new Date().toISOString() });
  forgetUser(user.id);
  return setStudentSession(json({ loggedIn: true }), user.id);
});

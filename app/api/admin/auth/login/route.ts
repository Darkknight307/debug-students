import type { NextRequest } from "next/server";
import { getStore } from "../../../../../lib/server/store";
import { verifyPassword } from "../../../../../lib/server/password";
import { isServerConfigured, setAdminSession } from "../../../../../lib/server/auth";
import { HttpError, body, json, route } from "../../../../../lib/server/route";
import { bootstrapAdmin } from "../../../../../lib/server/admin";
import { recordFailure, tooManyFailures, clearFailures } from "../../../../../lib/rateLimit";
import { normalizeEmail } from "../../../../../lib/registration";
import { clientIp } from "../../../../../lib/server/ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req: NextRequest) => {
  if (!isServerConfigured()) throw new HttpError(500, "Сервер әлі бапталмаған");
  const b = await body(req);
  const email = normalizeEmail(b.email);
  const password = typeof b.password === "string" ? b.password : "";
  const key = "admin:" + clientIp(req);
  if (tooManyFailures(key, 10)) throw new HttpError(429, "Тым көп сәтсіз әрекет. 10 минуттан кейін қайталаңыз.");
  await bootstrapAdmin();
  const user = email ? await getStore().userByEmail(email) : null;
  if (!user || !password || !(await verifyPassword(password, user.password_hash))) {
    recordFailure(key, 10 * 60_000);
    throw new HttpError(401, "Email немесе құпия сөз қате");
  }
  if (user.role !== "admin") throw new HttpError(403, "Бұл аккаунт әкімші емес");
  clearFailures(key);
  return setAdminSession(json({ admin: { email: user.email } }), user.id);
});

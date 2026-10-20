import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { getStore } from "../../../../lib/server/store";
import { HttpError, body, json, route } from "../../../../lib/server/route";
import { sendMail } from "../../../../lib/server/mailer";
import { sha256 } from "../../../../lib/server/password";
import { hit } from "../../../../lib/rateLimit";
import { isValidEmail, normalizeEmail } from "../../../../lib/registration";
import { clientIp, siteUrl } from "../../../../lib/server/ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60_000;
const RESET_TTL_MS = 60 * 60_000;

/**
 * «Құпия сөзді ұмыттым»: бір реттік токен (тек SHA-256 хэші сақталады, 1 сағат), сілтеме хатпен.
 * Жауап әрқашан бірдей — email бар-жоғы ашылмайды.
 */
export const POST = route(async (req: NextRequest) => {
  const email = normalizeEmail((await body(req)).email);
  if (!isValidEmail(email)) throw new HttpError(400, "Email дұрыс емес");
  const ip = clientIp(req);
  if (hit("forgot-ip:" + ip, 20, WINDOW_MS) || hit("forgot:" + email, 3, WINDOW_MS)) {
    throw new HttpError(429, "Хат жақында жіберілген. Бірнеше минуттан кейін қайталаңыз.");
  }
  const store = getStore();
  const user = await store.userByEmail(email);
  if (user && user.role === "student") {
    const token = crypto.randomBytes(32).toString("base64url");
    await store.addResetToken({ token_hash: sha256(token), user_id: user.id, expires_at: new Date(Date.now() + RESET_TTL_MS).toISOString() });
    const link = `${siteUrl(req)}/auth/reset?token_hash=${token}&type=recovery`;
    await sendMail({ to: email, subject: "DEBUG · Құпия сөзді қалпына келтіру", text: `Жаңа құпия сөз қою үшін: ${link}`, link });
  }
  return json({ sent: true });
});

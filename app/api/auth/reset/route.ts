import type { NextRequest } from "next/server";
import { isServerConfigured } from "../../../../lib/supabaseAdmin";
import { clientIp, describeAuthError, isAuthConfigured, supabaseAuth } from "../../../../lib/supabaseAuth";
import { hit } from "../../../../lib/rateLimit";
import { validatePassword } from "../../../../lib/registration";
import { NotAStudentError, saveStudent, withSession } from "../../../../lib/studentAccount";
import { fail, ok, readJson } from "../../../../lib/contest/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Жаңа құпия сөзді қою. Хаттағы token_hash тек осы сәтте (батырма басылғанда) тексеріледі —
 * пошта сканерлері сілтемені алдын ала ашса да, токен жұмсалып қалмайды.
 * verifyOtp-тан алынған сессия тек осы сұраныстың клиентінде тұрады, браузерге берілмейді.
 */
export async function POST(req: NextRequest) {
  if (!isServerConfigured() || !isAuthConfigured()) return fail(500, "Сервер әлі бапталмаған. Ұйымдастырушыға хабарласыңыз.");
  const body = await readJson(req);
  if (!body) return fail(415, "JSON күтілді");
  const tokenHash = typeof body.tokenHash === "string" ? body.tokenHash.trim() : "";
  if (!tokenHash || tokenHash.length > 200) return fail(400, "Сілтеме толық емес. Хаттағы сілтемені қайта ашыңыз.");
  const bad = validatePassword(body.password);
  if (bad) return fail(400, bad.message, { field: "password" });

  const ip = clientIp(req);
  if (hit("reset-ip:" + ip, 30, 10 * 60_000)) return fail(429, "Тым көп әрекет. 10 минуттан кейін қайталаңыз.");

  const auth = supabaseAuth(ip).auth;
  const v = await auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (v.error || !v.data.user || !v.data.session) {
    const f = describeAuthError(v.error);
    return fail(f.status === 503 ? 503 : 400, f.status === 503 ? f.message : "Сілтеменің мерзімі өтіп кеткен немесе ол бұрын қолданылған. Жаңа хат сұраңыз.");
  }
  const u = await auth.updateUser({ password: body.password as string });
  if (u.error || !u.data.user) {
    const f = describeAuthError(u.error);
    return fail(f.status, f.message, { field: "password" });
  }

  // Құпия сөз жаңартылды — студентті бірден кіргіземіз
  try {
    const student = await saveStudent(u.data.user);
    return withSession(ok({ loggedIn: true }), student, u.data.user.id);
  } catch (e) {
    if (!(e instanceof NotAStudentError)) console.error("[auth] students upsert (reset):", (e as Error).message);
    return ok({ loggedIn: false });
  }
}

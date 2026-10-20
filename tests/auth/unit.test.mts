// Іске қосу: node --test tests/auth/unit.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { clearFailures, hit, recordFailure, tooManyFailures } from "../../lib/rateLimit.ts";
import { signSession, verifySession } from "../../lib/session.ts";
import {
  formatPhone, fullNameOf, isValidEmail, normalizeEmail, normalizePhone, profileFromMetadata, profileToMetadata, validateRegistration,
} from "../../lib/registration.ts";
import { describeAuthError } from "../../lib/supabaseAuth.ts";
import { publicName } from "../../lib/publicName.ts";

process.env.SESSION_SECRET = "unit-test-secret-unit-test-secret-000";

const good = { lastName: "Серіков", firstName: "Айдос", university: "Мок университеті", course: "2 курс", phone: "", email: "s1@mock.test", password: "fixture-pass-1" };

test("тіркелу: дұрыс форма өтеді, бос орындар тазаланады, email кіші әріппен", () => {
  const r = validateRegistration({ ...good, lastName: "  Серіков ", firstName: "Айдос  ", university: " Мок   университеті ", email: " S1@Mock.Test " });
  assert.ok(r.ok);
  assert.deepEqual(r.value, { lastName: "Серіков", firstName: "Айдос", university: "Мок университеті", course: "2 курс", phone: null, email: "s1@mock.test", password: "fixture-pass-1" });
  assert.equal(fullNameOf(r.value.lastName, r.value.firstName), "Серіков Айдос");
  assert.equal(publicName(fullNameOf("Әл-Фараби", "Әбу")), "Әл-Фараби Әбу");
});

test("тіркелу: әр өрістің қатесі өз атымен қайтады", () => {
  const field = (patch: Record<string, unknown>) => {
    const r = validateRegistration({ ...good, ...patch });
    return r.ok ? "ok" : r.field;
  };
  assert.equal(field({ lastName: "" }), "lastName");
  assert.equal(field({ firstName: "Айдос2" }), "firstName");
  assert.equal(field({ firstName: "<script>" }), "firstName");
  assert.equal(field({ lastName: "А".repeat(51) }), "lastName");
  assert.equal(field({ university: "М" }), "university");
  assert.equal(field({ university: "М".repeat(121) }), "university");
  assert.equal(field({ course: "7 курс" }), "course");
  assert.equal(field({ course: undefined }), "course");
  assert.equal(field({ phone: "12345" }), "phone");
  assert.equal(field({ email: "s1@mock" }), "email");
  assert.equal(field({ email: "жоқ" }), "email");
  assert.equal(field({ password: "1234567" }), "password");
  assert.equal(field({ password: "ә".repeat(37) }), "password"); // 74 байт > bcrypt шегі
  assert.equal(field({ password: 12345678 }), "password");
  assert.equal(field({ firstName: "О'Нил", lastName: "Әл-Фараби" }), "ok");
  assert.equal(validateRegistration(null).ok, false);
});

test("телефон: міндетті емес; ҚР нөмірі +7… түріне келеді, қате нөмір → false", () => {
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(undefined), null);
  for (const v of ["8 701 000 00 01", "+7 (701) 000-00-01", "87010000001", "77010000001", "7010000001"]) {
    assert.equal(normalizePhone(v), "+77010000001", v);
  }
  assert.equal(normalizePhone("+998 90 123 45 67"), "+998901234567");
  assert.equal(normalizePhone("12345"), false);
  assert.equal(normalizePhone("97010000001"), false);
  assert.equal(normalizePhone("телефон"), false);
  assert.equal(formatPhone("+77010000001"), "+7 (701) 000-00-01");
  assert.equal(formatPhone("+998901234567"), "+998901234567");
  assert.equal(formatPhone(null), "");
});

test("email: пішімі мен нормализация", () => {
  assert.equal(normalizeEmail("  Name@Mail.KZ "), "name@mail.kz");
  assert.ok(isValidEmail("name.surname+debug@stud.kaznu.kz"));
  for (const bad of ["name@mail", "@mail.kz", "name@.kz", "name mail@kz.kz", "a@b.c", "x".repeat(250) + "@m.kz"]) assert.ok(!isValidEmail(bad), bad);
});

test("auth метадеректері: профиль ↔ user_metadata; әкімшіде профиль жоқ → null", () => {
  const r = validateRegistration({ ...good, phone: "8 701 000 00 01" });
  assert.ok(r.ok);
  const { email: _e, password: _p, ...profile } = r.value;
  const meta = profileToMetadata(profile);
  assert.deepEqual(meta, { last_name: "Серіков", first_name: "Айдос", university: "Мок университеті", course: "2 курс", phone: "+77010000001" });
  assert.ok(!JSON.stringify(meta).includes("fixture-pass"));
  assert.deepEqual(profileFromMetadata(meta), profile);
  assert.equal(profileFromMetadata({}), null);
  assert.equal(profileFromMetadata(null), null);
});

test("Supabase қателері қазақша хабарға айналады", () => {
  const api = (code: string, status = 400) => describeAuthError(new AuthApiError("x", status, code));
  assert.deepEqual([api("invalid_credentials").status, api("invalid_credentials").message], [401, "Email немесе құпия сөз қате."]);
  assert.equal(api("email_not_confirmed").status, 403);
  assert.equal(api("user_already_exists", 422).status, 409);
  assert.equal(api("weak_password", 422).status, 400);
  assert.equal(api("over_email_send_rate_limit", 429).status, 429);
  assert.equal(api("something_new", 429).status, 429);
  assert.equal(api("something_new", 400).status, 400);
  assert.equal(describeAuthError(new AuthRetryableFetchError("fetch failed", 0)).status, 503);
  assert.equal(describeAuthError(null).status, 503); // белгісіз жағдай — «кейін қайталаңыз»
});

test("сессия: дұрыс токен өтеді; бұрмаланған, қолтаңбасыз, мерзімі өткен — өтпейді", () => {
  const now = Date.now();
  const token = signSession("sid-1", "auth-user-1", now);
  const c = verifySession(token, now);
  assert.ok(c);
  assert.equal(c.sid, "sid-1");
  assert.equal(c.jid, "auth-user-1");

  const mac = token.split(".")[1];
  const forgedBody = Buffer.from(JSON.stringify({ sid: "other", jid: "x", exp: 9e9 })).toString("base64url");
  assert.equal(verifySession(`${forgedBody}.${mac}`, now), null);
  assert.equal(verifySession(`${token.split(".")[0]}.AAAA`, now), null);
  assert.equal(verifySession(token, now + 13 * 3600 * 1000), null);
  assert.equal(verifySession(undefined), null);
});

test("жиілік шегі: 8 сәтсіздіктен кейін бұғаттайды, терезе өткен соң босатады", () => {
  const key = "u:unit";
  const now = 1_000_000;
  for (let i = 0; i < 8; i++) recordFailure(key, 600_000, now);
  assert.equal(tooManyFailures(key, 8, now), true);
  assert.equal(tooManyFailures(key, 8, now + 600_001), false);
  clearFailures(key);
  assert.equal(tooManyFailures(key, 8, now), false);
});

test("hit: әр әрекет саналады, шектен асқаны бұғатталады", () => {
  const now = 2_000_000;
  const res = Array.from({ length: 5 }, () => hit("reg:unit", 3, 600_000, now));
  assert.deepEqual(res, [false, false, false, true, true]);
  assert.equal(hit("reg:unit", 3, 600_000, now + 600_001), false);
});

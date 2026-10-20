/**
 * Тіркелу деректерін тексеру және тазалау. Сервер де (сенімді тексеріс), тіркелу формасы да
 * (курс тізімі, телефон көрінісі) қолданады — сондықтан мұнда тек таза функциялар.
 */

export const COURSES = ["1 курс", "2 курс", "3 курс", "4 курс", "5 курс", "6 курс", "Магистратура", "Докторантура"] as const;
export type Course = (typeof COURSES)[number];

export const PASSWORD_MIN = 8;
/** Supabase Auth құпия сөзді bcrypt-пен хэштейді: 72 байттан ұзыны қабылданбайды. */
export const PASSWORD_MAX_BYTES = 72;

export type Profile = {
  lastName: string;
  firstName: string;
  university: string;
  course: Course;
  phone: string | null;
};
export type Registration = Profile & { email: string; password: string };

export type Invalid = { ok: false; field: string; message: string };
export type Valid<T> = { ok: true; value: T };

/** Артық бос орындар жиналып, шеттері кесіледі: «  Серіков   Айдос » → «Серіков Айдос». */
export function clean(s: unknown): string {
  return typeof s === "string" ? s.normalize("NFC").replace(/\s+/g, " ").trim() : "";
}

export function normalizeEmail(s: unknown): string {
  return clean(s).toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(email);
}

// Әріптен басталады; ішінде әріп, дефис, апостроф, нүкте, бос орын болуы мүмкін (Әл-Фараби, О'Нил)
const NAME_RE = /^\p{L}[\p{L}\p{M}'’.\- ]*$/u;

/** Тегі мен аты: көпшілікке «Тегі Аты» болып көрсетіледі. */
export function fullNameOf(lastName: string, firstName: string): string {
  return `${lastName} ${firstName}`.trim();
}

/**
 * Телефон міндетті емес. Бос → null. Қазақстан нөмірі (8 701…, +7 701…, 701…) → +77010000001.
 * Басқа елдің нөмірі «+»-пен басталса, 10–15 цифр. Жарамсыз → false.
 */
export function normalizePhone(raw: unknown): string | null | false {
  const t = clean(raw);
  if (!t) return null;
  if (!/^[+\d\s().-]+$/.test(t)) return false;
  const d = t.replace(/\D/g, "");
  if (d.length === 11 && /^[78]7/.test(d)) return "+7" + d.slice(1);
  if (d.length === 10 && d.startsWith("7")) return "+7" + d;
  if (t.startsWith("+") && d.length >= 10 && d.length <= 15) return "+" + d;
  return false;
}

/** +77010000001 → +7 (701) 000-00-01; басқа нөмір өзгеріссіз. */
export function formatPhone(p: string | null | undefined): string {
  if (!p) return "";
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(p);
  return m ? `+7 (${m[1]}) ${m[2]}-${m[3]}-${m[4]}` : p;
}

function checkName(v: string, field: string, label: string): Invalid | null {
  if (!v) return { ok: false, field, message: `${label} енгізіңіз` };
  if (v.length > 50) return { ok: false, field, message: `${label} тым ұзын (ең көбі 50 таңба)` };
  if (!NAME_RE.test(v)) return { ok: false, field, message: `${label} тек әріптерден тұруы керек` };
  return null;
}

export function validatePassword(password: unknown): Invalid | null {
  const p = typeof password === "string" ? password : "";
  if (!p) return { ok: false, field: "password", message: "Құпия сөзді енгізіңіз" };
  if ([...p].length < PASSWORD_MIN) return { ok: false, field: "password", message: `Құпия сөз кемінде ${PASSWORD_MIN} таңба болсын` };
  if (new TextEncoder().encode(p).length > PASSWORD_MAX_BYTES) return { ok: false, field: "password", message: "Құпия сөз тым ұзын (ең көбі 72 байт)" };
  return null;
}

/** Профиль өрістері (email мен құпия сөзсіз): тіркелуде де, auth метадеректерін оқығанда да қолданылады. */
export function validateProfile(b: Record<string, unknown>): Valid<Profile> | Invalid {
  const lastName = clean(b.lastName);
  const firstName = clean(b.firstName);
  const university = clean(b.university);
  const course = clean(b.course);
  const bad =
    checkName(lastName, "lastName", "Тегіңізді") ||
    checkName(firstName, "firstName", "Атыңызды");
  if (bad) return bad;
  if (university.length < 2) return { ok: false, field: "university", message: "Оқу орныңызды енгізіңіз" };
  if (university.length > 120) return { ok: false, field: "university", message: "Оқу орнының атауы тым ұзын (ең көбі 120 таңба)" };
  if (!(COURSES as readonly string[]).includes(course)) return { ok: false, field: "course", message: "Курсыңызды таңдаңыз" };
  const phone = normalizePhone(b.phone);
  if (phone === false) return { ok: false, field: "phone", message: "Телефон нөмірі дұрыс емес (мысалы 8 701 000 00 00)" };
  return { ok: true, value: { lastName, firstName, university, course: course as Course, phone } };
}

export function validateRegistration(body: unknown): Valid<Registration> | Invalid {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const profile = validateProfile(b);
  if (!profile.ok) return profile;
  const email = normalizeEmail(b.email);
  if (!email) return { ok: false, field: "email", message: "Email енгізіңіз" };
  if (!isValidEmail(email)) return { ok: false, field: "email", message: "Email дұрыс емес" };
  const badPw = validatePassword(b.password);
  if (badPw) return badPw;
  return { ok: true, value: { ...profile.value, email, password: b.password as string } };
}

/** Supabase Auth-тағы user_metadata-ға жазылатын пішін (растау хатынан кейін студент жолын құру үшін). */
export function profileToMetadata(p: Profile): Record<string, string | null> {
  return { last_name: p.lastName, first_name: p.firstName, university: p.university, course: p.course, phone: p.phone };
}

/** user_metadata → Profile. Әкімші сияқты студент емес аккаунтта метадерек жоқ → null. */
export function profileFromMetadata(meta: unknown): Profile | null {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const r = validateProfile({ lastName: m.last_name, firstName: m.first_name, university: m.university, course: m.course, phone: m.phone });
  return r.ok ? r.value : null;
}

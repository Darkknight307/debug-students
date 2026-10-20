/**
 * mockService — бэкендсіз жұмыс істейтін `Api` (NEXT_PUBLIC_API_MODE=mock, `npm run dev:mock`).
 * Ережелер сервермен ортақ модульдерден алынады: тіркелуді тексеру (lib/registration),
 * код ережелері (lib/contest/rules), рейтинг пен кезең терезелері (lib/contest/logic).
 */
import type { Api } from "../api";
import {
  ApiError, DEFAULT_POINTS, type AdminContest, type AdminRound, type AdminTask, type ApiResult, type ActiveFull,
  type Mine, type StateResponse,
} from "../types";
import { validateRegistration, normalizeEmail, isValidEmail, validatePassword } from "../../registration";
import { checkCode, compareOutputs } from "../../contest/rules";
import {
  GRACE_MS, closeRoundPatch, computeRanking, extendRoundPatch, isBoardLocked, maskEmail, maskPhone, publicName,
  publicTask, roundWindow, startRoundPatches,
} from "../../contest/logic";
import { ADMIN_KEY, SESSION_KEY, delay, load, save, session, setSession, uid, type MockDb, type MockUser } from "./db";

const ok = <T>(data: T, status = 200): ApiResult<T> => ({ status, data: { ok: true, ...data } });
const fail = (status: number, message: string, extra: Record<string, unknown> = {}): ApiResult<never> => ({
  status,
  data: { ok: false, message, ...extra } as never,
});

function me(db: MockDb): MockUser | null {
  const id = session(SESSION_KEY);
  return db.users.find((u) => u.id === id && u.role === "student") ?? null;
}

function admin(db: MockDb): MockUser {
  const id = session(ADMIN_KEY);
  const u = db.users.find((x) => x.id === id && x.role === "admin");
  if (!u) throw new ApiError(401, "Әкімші ретінде кіріңіз");
  return u;
}

/** Ағымдағы жарыс: алдымен «жүріп жатыр» (ең кеші), болмаса ең жақын «жарияланды». */
function currentContest(db: MockDb): AdminContest | null {
  const by = (s: string) => db.contests.filter((c) => c.status === s);
  const running = by("running").sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0];
  return running ?? by("published").sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null;
}

const roundsOf = (db: MockDb, contestId: string) => db.rounds.filter((r) => r.contest_id === contestId).sort((a, b) => a.idx - b.idx);
const tasksOf = (db: MockDb, roundId: string) => db.tasks.filter((t) => t.round_id === roundId).sort((a, b) => a.idx - b.idx);
const nameOf = (db: MockDb) => (id: string) => db.users.find((u) => u.id === id)?.full_name ?? "?";

function windows(db: MockDb, contestId: string, studentId: string, now: number) {
  return roundsOf(db, contestId).map((r) => {
    const extra = db.extensions.find((e) => e.round_id === r.id && e.student_id === studentId)?.extra_min ?? 0;
    return roundWindow(r, extra, now);
  });
}

function variantFor(db: MockDb, contestId: string, studentId: string): "A" | "B" {
  let v = db.variants.find((x) => x.contest_id === contestId && x.student_id === studentId);
  if (!v) {
    v = { contest_id: contestId, student_id: studentId, variant: Math.random() < 0.5 ? "A" : "B" };
    db.variants.push(v);
    save(db);
  }
  return v.variant;
}

function findOpenTask(db: MockDb, contestId: string, studentId: string, taskId: string, now: number) {
  for (const w of windows(db, contestId, studentId, now)) {
    if (w.state !== "open") continue;
    const task = tasksOf(db, w.round.id).find((t) => t.id === taskId);
    if (task) return { w, task };
  }
  return null;
}

function ranking(db: MockDb, contestId: string) {
  return computeRanking(
    db.submissions.filter((s) => s.contest_id === contestId),
    roundsOf(db, contestId),
    nameOf(db),
  );
}

function addSubmission(db: MockDb, s: Omit<MockDb["submissions"][number], "id" | "created_at">) {
  db.seq += 1;
  db.submissions.push({ ...s, id: db.seq, created_at: new Date().toISOString() });
  save(db);
}

function patchRound(db: MockDb, id: string, patch: Partial<AdminRound>) {
  const r = db.rounds.find((x) => x.id === id);
  if (r) Object.assign(r, patch);
}

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new ApiError(400, "Сурет оқылмады"));
    fr.readAsDataURL(file);
  });

export const mockApi: Api = {
  mode: "mock",

  /* ---------------- студент: кіру ---------------- */
  auth: {
    async register(input) {
      await delay();
      const v = validateRegistration(input);
      if (!v.ok) return fail(400, v.message, { field: v.field });
      const db = load();
      if (db.users.some((u) => u.email === v.value.email)) {
        return fail(409, "Бұл email-мен бұрын тіркелгенсіз. «Кіру» қойындысынан кіріңіз.", { field: "email" });
      }
      const p = v.value;
      const u: MockUser = {
        id: uid(), email: p.email, password: p.password, role: "student", last_name: p.lastName, first_name: p.firstName,
        full_name: `${p.lastName} ${p.firstName}`, university: p.university, course: p.course, phone: p.phone,
        first_login_at: new Date().toISOString(),
      };
      db.users.push(u);
      save(db);
      setSession(SESSION_KEY, u.id);
      return ok({ loggedIn: true, student: { fullName: u.full_name } });
    },
    async login(email, password) {
      await delay();
      const e = normalizeEmail(email);
      if (!e || !password) return fail(400, "Email мен құпия сөзді енгізіңіз");
      if (!isValidEmail(e)) return fail(400, "Email дұрыс емес");
      const db = load();
      const u = db.users.find((x) => x.email === e);
      if (!u || u.password !== password) return fail(401, "Email немесе құпия сөз қате.");
      if (u.role !== "student") return fail(403, "Бұл аккаунт студент ретінде тіркелмеген. Сайтта тіркеліңіз.");
      setSession(SESSION_KEY, u.id);
      return ok({ student: { fullName: u.full_name } });
    },
    async logout() {
      setSession(SESSION_KEY, null);
    },
    async me() {
      const u = me(load());
      if (!u) return { loggedIn: false };
      return {
        loggedIn: true,
        name: publicName(u.full_name),
        profile: { fullName: u.full_name, university: u.university, course: u.course, emailMasked: maskEmail(u.email), phoneMasked: maskPhone(u.phone) },
      };
    },
    async forgot(email) {
      await delay();
      const e = normalizeEmail(email);
      if (!isValidEmail(e)) return fail(400, "Email дұрыс емес");
      const db = load();
      const u = db.users.find((x) => x.email === e && x.role === "student");
      if (u) {
        const token = uid();
        db.resetTokens.push({ token, user_id: u.id, expires_at: Date.now() + 3_600_000 });
        save(db);
        // Демо: хат жіберілмейді — сілтеме консольге шығады
        console.info(`[mock mail] ${e}: ${location.origin}/auth/reset?token_hash=${token}&type=recovery`);
      }
      return ok({ sent: true });
    },
    async reset(tokenHash, password) {
      await delay();
      const bad = validatePassword(password);
      if (bad) return fail(400, bad.message, { field: "password" });
      const db = load();
      const i = db.resetTokens.findIndex((x) => x.token === tokenHash && x.expires_at > Date.now());
      if (i < 0) return fail(400, "Сілтеменің мерзімі өтіп кеткен немесе ол бұрын қолданылған. Жаңа хат сұраңыз.");
      const [tok] = db.resetTokens.splice(i, 1);
      const u = db.users.find((x) => x.id === tok.user_id);
      if (!u) return fail(400, "Сілтеме жарамсыз.");
      if (u.password === password) return fail(400, "Жаңа құпия сөз бұрынғысынан өзгеше болуы керек.", { field: "password" });
      u.password = password;
      save(db);
      setSession(SESSION_KEY, u.id);
      return ok({ loggedIn: true });
    },
  },

  /* ---------------- студент: жарыс ---------------- */
  contest: {
    async state(full) {
      await delay(80);
      const db = load();
      const u = me(db);
      if (!u) {
        if (typeof window !== "undefined") window.location.href = "/login";
        return null;
      }
      const now = Date.now();
      const base = { ok: true, serverNow: new Date(now).toISOString(), student: { fullName: u.full_name } };
      const contest = currentContest(db);
      if (!contest) return { ...base, contest: null, rounds: [], active: null, me: null, boardLocked: false };

      const ws = windows(db, contest.id, u.id, now);
      const active = ws.find((w) => w.state === "open") ?? null;
      const rounds = roundsOf(db, contest.id);
      const boardLocked = isBoardLocked(contest, rounds, now);
      let mine: StateResponse["me"] = null;
      if (!boardLocked) {
        const rows = ranking(db, contest.id);
        const row = rows.find((r) => r.student_id === u.id);
        mine = row ? { rank: row.rank, score: row.score, total: row.total } : { rank: null, score: 0, total: rows[0]?.total ?? 0 };
      }
      const body: StateResponse = {
        ...base,
        contest: { id: contest.id, title: contest.title, status: contest.status, startsAt: contest.starts_at },
        rounds: ws.map((w) => ({
          id: w.round.id, idx: w.round.idx, kind: w.round.kind, title: w.round.title, durationMin: w.round.duration_min,
          state: w.state, endsAt: w.endsAt ? new Date(w.endsAt).toISOString() : null,
        })),
        active: active ? { roundId: active.round.id, idx: active.round.idx, kind: active.round.kind } : null,
        me: mine,
        boardLocked,
      };
      if (full && active) {
        const kind = active.round.kind;
        const variant = kind === "mcq" ? variantFor(db, contest.id, u.id) : null;
        const all = tasksOf(db, active.round.id);
        const hasVariants = all.some((t) => t.variant);
        const tasks = all.filter((t) => kind !== "mcq" || !t.variant || t.variant === variant);
        const m: Mine = {};
        const subs = db.submissions.filter((s) => s.student_id === u.id && tasks.some((t) => t.id === s.task_id)).sort((a, b) => b.id - a.id);
        for (const s of subs) {
          if (m[s.task_id]) continue;
          m[s.task_id] = kind === "mcq" ? { answer: s.answer ?? undefined } : { code: s.code ?? undefined, verdict: s.is_correct ? "correct" : "wrong" };
        }
        body.active = {
          roundId: active.round.id, idx: active.round.idx, kind, title: active.round.title,
          endsAt: active.endsAt ? new Date(active.endsAt).toISOString() : null,
          variant: hasVariants ? variant : null,
          tasks: tasks.map((t) => publicTask(t, kind)) as ActiveFull["tasks"],
          mine: m,
        };
      }
      return body;
    },

    async answer(taskId, choice) {
      await delay(100);
      const db = load();
      const u = me(db);
      if (!u) return fail(401, "Алдымен сайтқа кіріңіз");
      const c = currentContest(db);
      const found = c ? findOpenTask(db, c.id, u.id, taskId, Date.now() - GRACE_MS) : null;
      if (!c || !found || found.w.round.kind !== "mcq") return fail(409, "Бұл кезең қазір ашық емес");
      const { task, w } = found;
      if (task.variant && task.variant !== variantFor(db, c.id, u.id)) return fail(403, "Бұл сіздің нұсқаңыз емес");
      const key = choice.trim().toLowerCase();
      if (!(task.options ?? []).some((o) => o.key === key)) return fail(400, "Мұндай жауап нұсқасы жоқ");
      const correct = !!task.correct && key === task.correct.toLowerCase();
      addSubmission(db, { contest_id: c.id, round_id: w.round.id, task_id: task.id, student_id: u.id, answer: key, code: null, is_correct: correct, points: correct ? task.points : 0 });
      return ok({ saved: true });
    },

    async challenge(taskId) {
      await delay(100);
      const db = load();
      const u = me(db);
      if (!u) return fail(401, "Алдымен сайтқа кіріңіз");
      const c = currentContest(db);
      const found = c ? findOpenTask(db, c.id, u.id, taskId, Date.now()) : null;
      if (!found || found.w.round.kind === "mcq") return fail(409, "Бұл кезең қазір ашық емес");
      const hidden = found.task.tests_hidden ?? [];
      if (!hidden.length) return fail(409, "Бұл тапсырмада тексеру тесттері әлі жоқ. Ұйымдастырушыға хабарласыңыз.");
      const idx = hidden.map((_, i) => i).slice(0, 25);
      const token = btoa(JSON.stringify({ sid: u.id, tid: taskId, idx }));
      return ok({ token, inputs: idx.map((i) => hidden[i].args) });
    },

    async submit({ taskId, token, code, outputs }) {
      await delay(120);
      const db = load();
      const u = me(db);
      if (!u) return fail(401, "Алдымен сайтқа кіріңіз");
      let ch: { sid: string; tid: string; idx: number[] } | null = null;
      try {
        ch = JSON.parse(atob(token));
      } catch {
        ch = null;
      }
      if (!ch || ch.sid !== u.id || ch.tid !== taskId) return fail(400, "Тексеру мерзімі өтті. «Жіберу»-ді қайта басыңыз.");
      const c = currentContest(db);
      const found = c ? findOpenTask(db, c.id, u.id, taskId, Date.now() - GRACE_MS) : null;
      if (!c || !found || found.w.round.kind === "mcq") return fail(409, "Кезең уақыты аяқталды");
      const { task, w } = found;
      const rules = checkCode(
        { kind: w.round.kind as "debug" | "code", starter_code: task.starter_code, max_changed_lines: task.max_changed_lines, forbidden: task.forbidden },
        code,
      );
      if (!rules.ok) return fail(422, rules.message, { rejected: true, reason: rules.reason, changed: rules.changed });
      const expected = ch.idx.map((i) => task.tests_hidden[i]?.expected);
      if (expected.some((e) => typeof e !== "string")) return fail(409, "Тапсырма жаңартылды. «Жіберу»-ді қайта басыңыз.");
      const correct = compareOutputs(outputs, expected as string[]);
      addSubmission(db, { contest_id: c.id, round_id: w.round.id, task_id: task.id, student_id: u.id, answer: JSON.stringify(outputs), code, is_correct: correct, points: correct ? task.points : 0 });
      return ok({ correct });
    },

    async activity(body) {
      const db = load();
      const u = me(db);
      const c = currentContest(db);
      if (!u || !c) return false;
      try {
        const { roundId, data } = JSON.parse(body) as { roundId: string; data: Record<string, unknown> };
        const row = db.activity.find((a) => a.round_id === roundId && a.student_id === u.id);
        if (row) row.data = data;
        else db.activity.push({ round_id: roundId, student_id: u.id, contest_id: c.id, data });
        save(db);
        return true;
      } catch {
        return false;
      }
    },
  },

  /* ---------------- ашық беттер ---------------- */
  public: {
    async landing() {
      const db = load();
      const c = currentContest(db);
      const students = db.users.filter((u) => u.role === "student").sort((a, b) => b.first_login_at.localeCompare(a.first_login_at));
      return {
        ok: true, serverNow: new Date().toISOString(),
        contest: c ? { title: c.title, startsAt: c.starts_at, status: c.status } : null,
        students: { count: students.length, names: students.slice(0, 300).map((u) => publicName(u.full_name)) },
      };
    },
    async board() {
      const db = load();
      const updated = new Date().toISOString();
      const c = currentContest(db);
      if (!c) return { ok: true, idle: true, locked: false, rows: [], total: 0, updated, note: "Жарыс әлі басталған жоқ" };
      const rounds = roundsOf(db, c.id);
      if (isBoardLocked(c, rounds)) return { ok: true, locked: true, rows: [], total: 0, updated };
      const rows = ranking(db, c.id);
      const started = rounds.some((r) => r.status !== "pending");
      const trace = rounds.some((r) => r.kind === "mcq" && r.status === "running");
      return {
        ok: true, locked: false, updated, total: rows[0]?.total ?? 0,
        rows: rows.slice(0, 10).map((r) => ({ rank: r.rank, name: r.name, score: r.score })),
        ...(!rows.length && trace ? { note: "Trace жүріп жатыр — нәтиже кезең аяқталғанда ашылады" } : {}),
        ...(!rows.length && !started ? { idle: true, note: "Жарыс әлі басталған жоқ" } : {}),
      };
    },
  },

  /* ---------------- әкімші ---------------- */
  admin: {
    async me() {
      const db = load();
      const u = db.users.find((x) => x.id === session(ADMIN_KEY) && x.role === "admin");
      return u ? { email: u.email } : null;
    },
    async login(email, password) {
      await delay();
      const db = load();
      const u = db.users.find((x) => x.email === normalizeEmail(email));
      if (!u || u.password !== password) throw new ApiError(401, "Email немесе құпия сөз қате");
      if (u.role !== "admin") throw new ApiError(403, "Бұл аккаунт әкімші емес");
      setSession(ADMIN_KEY, u.id);
      return { email: u.email };
    },
    async logout() {
      setSession(ADMIN_KEY, null);
    },
    async stats() {
      const db = load();
      admin(db);
      const students = db.users.filter((u) => u.role === "student");
      const groups = new Map<string, { n: number; names: Map<string, number> }>();
      for (const s of students) {
        const name = (s.university || "—").replace(/\s+/g, " ").trim();
        const g = groups.get(name.toLowerCase()) ?? { n: 0, names: new Map() };
        g.n++;
        g.names.set(name, (g.names.get(name) ?? 0) + 1);
        groups.set(name.toLowerCase(), g);
      }
      const byUniversity = [...groups.values()]
        .map((g) => [[...g.names].sort((a, b) => b[1] - a[1])[0][0], g.n] as [string, number])
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      return { total: students.length, byUniversity };
    },
    async contests() {
      const db = load();
      admin(db);
      return [...db.contests].sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    },
    async createContest({ slug, title, starts_at }) {
      await delay();
      const db = load();
      admin(db);
      if (!slug.trim() || !title.trim() || isNaN(Date.parse(starts_at))) throw new ApiError(400, "Кілт, атау және басталу уақыты керек");
      if (db.contests.some((c) => c.slug === slug.trim())) throw new ApiError(409, "Бұл кілтпен жарыс бұрыннан бар");
      const c: AdminContest = { id: uid(), slug: slug.trim(), title: title.trim(), starts_at: new Date(starts_at).toISOString(), status: "draft", board_locked: false, board_autolock_min: 10 };
      db.contests.push(c);
      ([["mcq", "Trace — кодты оқу", 20], ["debug", "Debug — қатені түзет", 30], ["code", "Build — өзің жаз", 20]] as const).forEach(([kind, t, d], i) =>
        db.rounds.push({ id: uid(), contest_id: c.id, idx: i + 1, kind, title: t, duration_min: d, status: "pending", started_at: null, ends_at: null }),
      );
      save(db);
      return c;
    },
    async contest(id) {
      const db = load();
      admin(db);
      const contest = db.contests.find((c) => c.id === id);
      if (!contest) throw new ApiError(404, "Жарыс табылмады");
      const rounds = roundsOf(db, id);
      return { contest, rounds, tasks: db.tasks.filter((t) => rounds.some((r) => r.id === t.round_id)).sort((a, b) => a.idx - b.idx) };
    },
    async updateContest(id, patch) {
      await delay(100);
      const db = load();
      admin(db);
      const c = db.contests.find((x) => x.id === id);
      if (!c) throw new ApiError(404, "Жарыс табылмады");
      if (patch.title !== undefined && !patch.title.trim()) throw new ApiError(400, "Жарыстың атауы керек");
      if (patch.starts_at !== undefined && isNaN(Date.parse(patch.starts_at))) throw new ApiError(400, "Басталу уақыты дұрыс емес");
      Object.assign(c, patch);
      save(db);
      return c;
    },
    async startRound(roundId) {
      await delay(100);
      const db = load();
      admin(db);
      const r = db.rounds.find((x) => x.id === roundId);
      if (!r) throw new ApiError(404, "Кезең табылмады");
      for (const p of startRoundPatches(roundsOf(db, r.contest_id), roundId, Date.now()) ?? []) patchRound(db, p.id, p.patch);
      const c = db.contests.find((x) => x.id === r.contest_id);
      if (c && (c.status === "draft" || c.status === "published")) c.status = "running";
      save(db);
    },
    async extendRound(roundId, minutes) {
      const db = load();
      admin(db);
      if (!(minutes >= 1 && minutes <= 60)) throw new ApiError(400, "Минут 1–60 аралығында болсын");
      const r = db.rounds.find((x) => x.id === roundId);
      const p = r ? extendRoundPatch(r, minutes, Date.now()) : null;
      if (!r || !p) throw new ApiError(409, "Кезең қазір жүріп тұрған жоқ");
      Object.assign(r, p);
      save(db);
    },
    async closeRound(roundId) {
      const db = load();
      admin(db);
      const r = db.rounds.find((x) => x.id === roundId);
      const p = r ? closeRoundPatch(r, Date.now()) : null;
      if (!r || !p) throw new ApiError(409, "Кезең қазір жүріп тұрған жоқ");
      Object.assign(r, p);
      save(db);
    },
    async createTask(input) {
      await delay();
      const db = load();
      admin(db);
      if (!db.rounds.some((r) => r.id === input.round_id)) throw new ApiError(404, "Кезең табылмады");
      if (db.tasks.some((t) => t.round_id === input.round_id && t.idx === input.idx && (t.variant ?? null) === (input.variant ?? null))) {
        throw new ApiError(409, "Бұл реттік нөмір (және нұсқа) бұл кезеңде бұрыннан бар");
      }
      const t: AdminTask = { ...input, id: uid(), forbidden: input.forbidden ?? [], ai_refs: input.ai_refs ?? [], points: input.points ?? DEFAULT_POINTS.mcq };
      db.tasks.push(t);
      save(db);
      return t;
    },
    async updateTask(id, patch) {
      await delay();
      const db = load();
      admin(db);
      const t = db.tasks.find((x) => x.id === id);
      if (!t) throw new ApiError(404, "Тапсырма табылмады");
      const next = { ...t, ...patch };
      if (db.tasks.some((x) => x.id !== id && x.round_id === next.round_id && x.idx === next.idx && (x.variant ?? null) === (next.variant ?? null))) {
        throw new ApiError(409, "Бұл реттік нөмір (және нұсқа) бұл кезеңде бұрыннан бар");
      }
      Object.assign(t, next);
      save(db);
      return t;
    },
    async deleteTask(id) {
      const db = load();
      admin(db);
      db.tasks = db.tasks.filter((t) => t.id !== id);
      save(db);
    },
    async uploadImage(file) {
      admin(load());
      if (!file.type.startsWith("image/")) throw new ApiError(415, "Тек сурет файлы");
      if (file.size > 2 * 1024 * 1024) throw new ApiError(413, "Сурет 2 МБ-тан аспауы керек");
      return { url: await readFile(file) };
    },
    async operator(contestId) {
      const db = load();
      admin(db);
      const running = roundsOf(db, contestId).find((r) => r.status === "running");
      return {
        submissions: db.submissions.filter((s) => s.contest_id === contestId).length,
        people: db.variants.filter((v) => v.contest_id === contestId).length,
        extensions: running
          ? db.extensions.filter((e) => e.round_id === running.id).map((e) => ({ ...e, name: nameOf(db)(e.student_id) }))
          : [],
      };
    },
    async searchStudents(q) {
      const db = load();
      admin(db);
      const s = q.trim().toLowerCase();
      if (s.length < 2) return [];
      return db.users
        .filter((u) => u.role === "student" && u.full_name.toLowerCase().includes(s))
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
        .slice(0, 8)
        .map((u) => ({ id: u.id, full_name: u.full_name }));
    },
    async extendStudent(roundId, studentId) {
      const db = load();
      admin(db);
      const prev = db.extensions.find((e) => e.round_id === roundId && e.student_id === studentId);
      const extra = Math.min((prev?.extra_min ?? 0) + 5, 60);
      if (prev) prev.extra_min = extra;
      else db.extensions.push({ round_id: roundId, student_id: studentId, extra_min: extra });
      save(db);
      return { extra_min: extra };
    },
    async ranking(contestId) {
      const db = load();
      admin(db);
      return ranking(db, contestId);
    },
    async recheckSubmissions(contestId, studentIds, taskIds) {
      const db = load();
      admin(db);
      return db.submissions
        .filter((s) => s.contest_id === contestId && studentIds.includes(s.student_id) && taskIds.includes(s.task_id))
        .sort((a, b) => b.id - a.id)
        .map(({ id, student_id, task_id, code, is_correct, created_at }) => ({ id, student_id, task_id, code, is_correct, created_at }));
    },
    async analysis(contestId) {
      const db = load();
      admin(db);
      const c = db.contests.find((x) => x.id === contestId);
      if (!c) throw new ApiError(404, "Жарыс табылмады");
      const rounds = roundsOf(db, contestId);
      const subs = db.submissions.filter((s) => s.contest_id === contestId).sort((a, b) => a.id - b.id);
      const ids = [...new Set(subs.map((s) => s.student_id))];
      return {
        title: c.title,
        rounds: rounds.map(({ id, idx, kind, started_at, ends_at }) => ({ id, idx, kind, started_at, ends_at })),
        tasks: db.tasks.filter((t) => rounds.some((r) => r.id === t.round_id)).sort((a, b) => a.idx - b.idx),
        students: ids.map((id) => ({ id, full_name: nameOf(db)(id) })),
        subs: subs.map(({ id, student_id, task_id, code, is_correct, points, created_at }) => ({ id, student_id, task_id, code, is_correct, points, created_at })),
        activity: db.activity.filter((a) => a.contest_id === contestId).map(({ student_id, round_id, data }) => ({ student_id, round_id, data })),
      };
    },
  },
};

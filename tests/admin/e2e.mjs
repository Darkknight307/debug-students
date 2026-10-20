// Әкімші API-ының толық ағыны: нақты Next.js сервері + Store (E2E_DRIVER=memory|sqlite).
// Іске қосу: node tests/admin/e2e.mjs
import { spawn } from "node:child_process";

const DRIVER = process.env.E2E_DRIVER || "memory";
const APP = `http://127.0.0.1:${DRIVER === "memory" ? 3104 : 3114}`;
const DB_ENV = DRIVER === "memory" ? { DB_DRIVER: "memory" } : { DB_DRIVER: "sqlite", DATABASE_URL: process.env.E2E_DATABASE_URL };
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  ✓ " + m); };
const bad = (m, d) => { fail++; console.log("  ✗ " + m + " — " + d); };
const expect = (m, got, want) => (JSON.stringify(got) === JSON.stringify(want) ? ok(m) : bad(m, `күтілгені ${JSON.stringify(want)}, келгені ${JSON.stringify(got)}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = spawn("npx", ["next", "dev", "-p", APP.split(":").pop()], {
  stdio: "ignore",
  env: { ...process.env, ...DB_ENV, E2E_TEST_HOOKS: "1", ADMIN_EMAIL: "admin@mock.test", ADMIN_PASSWORD: "admin-pass-123", SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-000", NEXT_DIST_DIR: "node_modules/.cache/next-e2e-admin-" + DRIVER },
  detached: true,
});
process.on("exit", () => { try { process.kill(-app.pid); } catch {} });

async function call(cookie, method, path, body, headers = {}) {
  const isRaw = body instanceof Uint8Array;
  const r = await fetch(APP + path, {
    method,
    headers: { ...(isRaw ? {} : { "content-type": "application/json" }), cookie, ...headers },
    body: body === undefined ? undefined : isRaw ? body : JSON.stringify(body),
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, text, headers: r.headers };
}
const hook = (p, b) => call("", "POST", "/api/test-hooks/" + p, b ?? {});
const dump = async () => (await call("", "GET", "/api/test-hooks/dump")).data;
const cookieOf = (r) => (r.headers.get("set-cookie") || "").split(";")[0];

async function main() {
  console.log(`Next.js іске қосылуда… (DB_DRIVER=${DRIVER})`);
  for (let i = 0; i < 120; i++) { try { if ((await fetch(APP + "/login")).status === 200) break; } catch {} await sleep(1000); }
  await hook("reset");
  await hook("seed", { users: [{ id: "b1000000-0000-4000-8000-000000000001", email: "s1@mock.test", password: "fixture-pass", last_name: "Серіков", first_name: "Айдос", full_name: "Серіков Айдос", university: "Мок университеті", course: "2 курс" },
    { id: "b2000000-0000-4000-8000-000000000002", email: "s2@mock.test", password: "fixture-pass", last_name: "Қайрат", first_name: "Бота", full_name: "Қайрат Бота", university: "мок   УНИВЕРСИТЕТІ", course: "1 курс" }] });

  console.log("1. Әкімші кіруі");
  expect("кірмеген → 401", (await call("", "GET", "/api/admin/contests")).status, 401);
  const stu = cookieOf(await call("", "POST", "/api/auth/login", { email: "s1@mock.test", password: "fixture-pass" }));
  expect("студент сессиясымен әкімші API-і → 401", (await call(stu, "GET", "/api/admin/contests")).status, 401);
  expect("студент әкімші ретінде кіре алмайды → 403", (await call("", "POST", "/api/admin/auth/login", { email: "s1@mock.test", password: "fixture-pass" })).status, 403);
  expect("қате құпия сөз → 401", (await call("", "POST", "/api/admin/auth/login", { email: "admin@mock.test", password: "nope-nope" })).status, 401);
  const login = await call("", "POST", "/api/admin/auth/login", { email: "admin@mock.test", password: "admin-pass-123" });
  const adm = cookieOf(login);
  expect("әкімші кірді (ADMIN_EMAIL-ден құрылды)", [login.status, login.data?.admin?.email], [200, "admin@mock.test"]);
  expect("me", (await call(adm, "GET", "/api/admin/auth/me")).data?.admin?.email, "admin@mock.test");
  const st = (await call(adm, "GET", "/api/admin/stats")).data;
  expect("статистика: 2 студент, оқу орны регистрсіз топталды", [st.total, st.byUniversity.length, st.byUniversity[0][1]], [2, 1, 2]);

  console.log("2. Жарыстар");
  const cr = await call(adm, "POST", "/api/admin/contests", { slug: "2026-11", title: "DEBUG · Қараша", starts_at: "2026-11-01T10:00:00Z" });
  expect("жарыс құрылды", cr.status, 200);
  const C = cr.data.contest.id;
  const dup = await call(adm, "POST", "/api/admin/contests", { slug: "2026-11", title: "x", starts_at: "2026-11-01T10:00:00Z" });
  expect("қайталанған кілт → 409 (B60-2)", [dup.status, dup.data?.message], [409, "Бұл кілтпен жарыс бұрыннан бар"]);
  expect("жарыс біреу ғана қалды", (await dump()).contests.length, 1);
  expect("бос атау → 400", (await call(adm, "POST", "/api/admin/contests", { slug: "z", title: " ", starts_at: "2026-11-01T10:00:00Z" })).status, 400);
  let b = (await call(adm, "GET", `/api/admin/contests/${C}`)).data;
  expect("үш кезең автоматты", b.rounds.map((r) => [r.kind, r.duration_min, r.status]), [["mcq", 20, "pending"], ["debug", 30, "pending"], ["code", 20, "pending"]]);
  const [R1, R2] = b.rounds.map((r) => r.id);
  expect("жарияланды", (await call(adm, "PATCH", `/api/admin/contests/${C}`, { status: "published" })).data?.contest?.status, "published");
  expect("жоқ күй → 400", (await call(adm, "PATCH", `/api/admin/contests/${C}`, { status: "deleted" })).status, 400);
  expect("жоқ жарыс → 404", (await call(adm, "GET", "/api/admin/contests/00000000-0000-4000-8000-000000000000")).status, 404);
  expect("басты бет жарысты көрсетеді", (await call("", "GET", "/api/public/landing")).data?.contest?.title, "DEBUG · Қараша");

  console.log("3. Тапсырмалар");
  const t = { round_id: R1, idx: 1, title: "Цикл", statement: "?", points: 1, options: [{ key: "a", text: "1" }, { key: "b", text: "2" }], correct: "b", variant: null };
  const t1 = await call(adm, "POST", "/api/admin/tasks", t);
  expect("тапсырма құрылды", [t1.status, t1.data?.task?.correct], [200, "b"]);
  expect("қайталанған (кезең, нөмір, нұсқа) → 409 (B60-3)", (await call(adm, "POST", "/api/admin/tasks", t)).status, 409);
  const t2 = await call(adm, "POST", "/api/admin/tasks", { ...t, idx: 2 });
  expect("PATCH басқа тапсырманың нөміріне → 409, өзгермеді (B60-4)", [(await call(adm, "PATCH", `/api/admin/tasks/${t2.data.task.id}`, { idx: 1 })).status, (await dump()).tasks.find((x) => x.id === t2.data.task.id).idx], [409, 2]);
  expect("PATCH атауы", (await call(adm, "PATCH", `/api/admin/tasks/${t2.data.task.id}`, { title: "Жаңа" })).data?.task?.title, "Жаңа");
  expect("атаусыз → 400", (await call(adm, "POST", "/api/admin/tasks", { ...t, idx: 3, title: "" })).status, 400);
  expect("жоқ кезең → 404", (await call(adm, "POST", "/api/admin/tasks", { ...t, idx: 4, round_id: "00000000-0000-4000-8000-000000000000" })).status, 404);
  expect("өшіру", (await call(adm, "DELETE", `/api/admin/tasks/${t2.data.task.id}`)).status, 200);
  expect("қайта өшіру → 404", (await call(adm, "DELETE", `/api/admin/tasks/${t2.data.task.id}`)).status, 404);
  expect("студентке жарыс күйінде жауап кілті жоқ", /"correct"/.test((await call(stu, "GET", "/api/contest/state?full=1")).text), false);

  console.log("4. Суреттер");
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const up = await call(adm, "POST", "/api/admin/images", png, { "content-type": "image/png" });
  expect("сурет жүктелді", [up.status, /^\/api\/images\/[0-9a-f-]{36}$/.test(up.data?.url ?? "")], [200, true]);
  const img = await fetch(APP + up.data.url);
  expect("сурет беріледі (түрі, байттары)", [img.status, img.headers.get("content-type"), (await img.arrayBuffer()).byteLength], [200, "image/png", png.length]);
  expect("сурет емес → 415", (await call(adm, "POST", "/api/admin/images", png, { "content-type": "text/html" })).status, 415);
  expect("2 МБ-тан үлкен → 413", (await call(adm, "POST", "/api/admin/images", new Uint8Array(2 * 1024 * 1024 + 1), { "content-type": "image/png" })).status, 413);
  expect("студент сурет жүктей алмайды → 401", (await call(stu, "POST", "/api/admin/images", png, { "content-type": "image/png" })).status, 401);

  console.log("5. Оператор");
  expect("жүріп тұрмаған кезеңді ұзарту → 409", (await call(adm, "POST", `/api/admin/rounds/${R1}/extend`, { minutes: 5 })).status, 409);
  const s1 = await call(adm, "POST", `/api/admin/rounds/${R1}/start`);
  expect("Trace басталды, жарыс жүріп жатыр", [s1.data?.round?.status, (await call(adm, "GET", `/api/admin/contests/${C}`)).data.contest.status], ["running", "running"]);
  const ext = await call(adm, "POST", `/api/admin/rounds/${R1}/extend`, { minutes: 5 });
  expect("бәріне +5 мин", Date.parse(ext.data.round.ends_at) - Date.parse(s1.data.round.ends_at), 5 * 60_000);
  expect("минут 1–60 → 400", (await call(adm, "POST", `/api/admin/rounds/${R1}/extend`, { minutes: 0 })).status, 400);
  const hits = (await call(adm, "GET", "/api/admin/students?q=Сер")).data.students;
  expect("іздеу", hits.map((h) => h.full_name), ["Серіков Айдос"]);
  expect("1 әріппен іздеу бос", (await call(adm, "GET", "/api/admin/students?q=С")).data.students, []);
  const e1 = await call(adm, "POST", `/api/admin/rounds/${R1}/extensions`, { studentId: hits[0].id });
  const e2 = await call(adm, "POST", `/api/admin/rounds/${R1}/extensions`, { studentId: hits[0].id });
  expect("жеке +5, +10", [e1.data.extra_min, e2.data.extra_min], [5, 10]);
  expect("жоқ студент → 404", (await call(adm, "POST", `/api/admin/rounds/${R1}/extensions`, { studentId: "nope" })).status, 404);
  await sleep(3200);
  const ans = await call(stu, "POST", "/api/contest/answer", { taskId: t1.data.task.id, choice: "b" });
  expect("студент жауап берді", ans.status, 200);
  const op = (await call(adm, "GET", `/api/admin/contests/${C}/operator`)).data;
  expect("оператор: 1 жіберілім, ұзарту аты-жөнімен", [op.submissions, op.extensions[0]?.name, op.extensions[0]?.extra_min], [1, "Серіков Айдос", 10]);
  const s2 = await call(adm, "POST", `/api/admin/rounds/${R2}/start`);
  b = (await call(adm, "GET", `/api/admin/contests/${C}`)).data;
  expect("Debug басталғанда Trace жабылды", b.rounds.map((r) => r.status), ["closed", "running", "pending"]);
  expect("кезеңді аяқтау", (await call(adm, "POST", `/api/admin/rounds/${R2}/close`)).data?.round?.status, "closed");
  expect("қайта аяқтау → 409", (await call(adm, "POST", `/api/admin/rounds/${R2}/close`)).status, 409);
  void s2;

  console.log("6. Рейтинг, қайта тексеру, талдау");
  const rank = (await call(adm, "GET", `/api/admin/contests/${C}/ranking`)).data.rows;
  expect("рейтинг (Trace жабылған соң есептелді)", rank.map((r) => [r.name, r.score]), [["Серіков Айдос", 1]]);
  const subs = (await call(adm, "POST", `/api/admin/contests/${C}/submissions`, { studentIds: [hits[0].id], taskIds: [t1.data.task.id] })).data.submissions;
  expect("қайта тексеру жіберілімдері", subs.length, 1);
  const an = (await call(adm, "GET", `/api/admin/contests/${C}/analysis`)).data;
  expect("талдау бумасы", [an.title, an.rounds.length, an.students[0]?.full_name, an.subs.length, Array.isArray(an.activity)], ["DEBUG · Қараша", 3, "Серіков Айдос", 1, true]);
  expect("лидербордты қолмен жабу", (await call(adm, "PATCH", `/api/admin/contests/${C}`, { board_locked: true })).data?.contest?.board_locked, true);
  expect("лидерборд жабық", (await call("", "GET", "/api/board")).data?.locked, true);

  console.log("7. Шығу");
  const out = await call(adm, "POST", "/api/admin/auth/logout");
  expect("cookie өшірілді", /Max-Age=0/.test(out.headers.get("set-cookie") || ""), true);

  console.log(`\n${pass} өтті, ${fail} өтпеді`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

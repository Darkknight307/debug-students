// Кезеңдердің толық ағыны: Next.js + мок Supabase Auth/PostgREST.
// Іске қосу: node tests/contest/e2e.mjs   (Pyodide бөлігі браузерде бөлек тексеріледі)
import { spawn } from "node:child_process";

// Порттар dev-mock.sh-тағыдан бөлек (4466/3101), екеуі қатар жүре алады
const MOCK = "http://127.0.0.1:4477";
const APP = "http://127.0.0.1:3102";
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  ✓ " + m); };
const bad = (m, d) => { fail++; console.log("  ✗ " + m + " — " + d); };
const expect = (m, got, want) => (JSON.stringify(got) === JSON.stringify(want) ? ok(m) : bad(m, `күтілгені ${JSON.stringify(want)}, келгені ${JSON.stringify(got)}`));
const truthy = (m, v, d = "") => (v ? ok(m) : bad(m, d || "шарт орындалмады"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (ms) => new Date(Date.now() + ms).toISOString();

const mock = spawn("node", ["tests/contest/mock-db.mjs"], { stdio: "ignore", env: { ...process.env, MOCK_PORT: "4477" } });
const app = spawn("npx", ["next", "dev", "-p", "3102"], {
  stdio: "ignore",
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: MOCK, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc", SUPABASE_SECRET_KEY: "", SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-000", NEXT_DIST_DIR: "node_modules/.cache/next-e2e" },
  detached: true,
});
const stop = () => { try { process.kill(-app.pid); } catch {} mock.kill(); };
process.on("exit", stop);

const mockPost = (p, b) => fetch(MOCK + p, { method: "POST", body: JSON.stringify(b) }).then((r) => r.json());
async function call(cookie, method, path, body) {
  const r = await fetch(APP + path, {
    method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, text };
}
async function login(email) {
  const r = await fetch(APP + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "fixture-pass" }) });
  const c = (r.headers.get("set-cookie") || "").split(";")[0];
  return { status: r.status, cookie: c };
}

// ---------- фикстура ----------
const C = "10000000-0000-4000-8000-000000000001";
const R1 = "20000000-0000-4000-8000-000000000001", R2 = "20000000-0000-4000-8000-000000000002", R3 = "20000000-0000-4000-8000-000000000003";
const T1A = "30000000-0000-4000-8000-00000000001a", T1B = "30000000-0000-4000-8000-00000000001b", T2 = "30000000-0000-4000-8000-000000000002";
const D11 = "30000000-0000-4000-8000-000000000011", B15 = "30000000-0000-4000-8000-000000000015";
const opts = [{ key: "a", text: "1" }, { key: "b", text: "2" }, { key: "c", text: "3" }, { key: "d", text: "4" }];
const STARTER = "def f(a):\n    s = 0\n    for x in a:\n        s += x\n    return s + 1\n";
const D11_HIDDEN = [{ args: [[1]], expected: "1" }, { args: [[5, 5]], expected: "10" }, { args: [[]], expected: "0" }];
const B15_HIDDEN = [{ args: [[1, 1, 2]], expected: "2" }, { args: [["a", "b", "a"]], expected: "2" }, { args: [[]], expected: "0" }];
const round = (id, idx, kind, extra = {}) => ({ id, contest_id: C, idx, kind, title: kind, duration_min: 20, status: "pending", started_at: null, ends_at: null, ...extra });
const task = (id, round_id, idx, extra) => ({ id, round_id, idx, title: `t${idx}`, statement: "шарт", points: 1, options: null, correct: null, starter_code: null, solution_code: "SECRET_SOLUTION", entry: null, max_changed_lines: null, forbidden: [], variant: null, image_url: null, tests_public: [], tests_hidden: [], ...extra });

async function main() {
  console.log("Next.js іске қосылуда…");
  for (let i = 0; i < 120; i++) { try { if ((await fetch(APP + "/login")).status === 200) break; } catch {} await sleep(1000); }

  const s1 = await login("s1@mock.test"), s2 = await login("s2@mock.test");
  expect("екі студент кірді", [s1.status, s2.status], [200, 200]);

  console.log("0. Supabase-ті ояту жолы");
  const ka = await call("", "GET", "/api/cron/keepalive");
  expect("keepalive → ok", [ka.status, ka.data?.ok], [200, true]);
  truthy("keepalive дерек қайтармайды", !/full_name|email|title/.test(ka.text), ka.text);

  console.log("1. Жарыс жоқ");
  let st = await call(s1.cookie, "GET", "/api/contest/state");
  expect("contest = null", st.data?.contest, null);
  expect("кірмеген студент → 401", (await call("", "GET", "/api/contest/state")).status, 401);
  const idle = await call("", "GET", "/api/board");
  expect("лидерборд: жарыс жоқ → бос, «Жарыс әлі басталған жоқ»", [idle.data?.ok, idle.data?.idle, idle.data?.rows?.length, idle.data?.note], [true, true, 0, "Жарыс әлі басталған жоқ"]);
  expect("лидербордта демо/архив дерегі жоқ", [idle.data?.demo, idle.data?.total], [undefined, 0]);

  await mockPost("/__seed", {
    contests: [{ id: C, slug: "t", title: "Тест жарысы", starts_at: iso(3600_000), status: "published", board_locked: false, board_autolock_min: 10 }],
    rounds: [round(R1, 1, "mcq"), round(R2, 2, "debug"), round(R3, 3, "code")],
    tasks: [
      task(T1A, R1, 1, { options: opts, correct: "b", variant: "A" }),
      task(T1B, R1, 1, { options: opts, correct: "c", variant: "B" }),
      task(T2, R1, 2, { options: opts, correct: "a", image_url: "https://example.com/q2.png" }),
      task(D11, R2, 11, { points: 3, entry: "f", starter_code: STARTER, max_changed_lines: 1, tests_public: [{ args: [[1, 2]], expected: "3" }], tests_hidden: D11_HIDDEN }),
      task(B15, R3, 15, { points: 4, entry: "g", starter_code: "def g(a):\n    pass\n", forbidden: ["set("], tests_hidden: B15_HIDDEN }),
    ],
  });
  await sleep(3200);

  console.log("1б. Басты бетке арналған ашық дерек");
  const land = await call("", "GET", "/api/public/landing");
  expect("landing: жарыс атауы мен уақыты", [land.status, land.data?.contest?.title, typeof land.data?.contest?.startsAt], [200, "Тест жарысы", "string"]);
  expect("landing: тіркелген студенттер саны", land.data?.students?.count, 2);
  truthy("landing: тек «Тегі Аты»", land.data?.students?.names?.includes("Серіков Айдос") && land.data?.students?.names?.includes("Қайрат Бота"), land.text);
  truthy("landing: email, телефон, оқу орны, id шықпайды", !/\+7701|@mock|Мок унив|Мок колл|phone|email|university|auth_user|b1000000/.test(land.text), land.text);
  expect("me: кірген студент", (await call(s1.cookie, "GET", "/api/auth/me")).data, { loggedIn: true, name: "Серіков Айдос" });
  expect("me: кірмеген адам", (await call("", "GET", "/api/auth/me")).data, { loggedIn: false });

  console.log("2. Жарыс жарияланған, кезең басталмаған");
  st = await call(s1.cookie, "GET", "/api/contest/state?full=1");
  expect("жарыс көрінеді", st.data?.contest?.title, "Тест жарысы");
  expect("3 кезең, бәрі pending", st.data?.rounds?.map((r) => r.state), ["pending", "pending", "pending"]);
  expect("белсенді кезең жоқ", st.data?.active, null);
  expect("кезең ашылмай жауап → 409", (await call(s1.cookie, "POST", "/api/contest/answer", { taskId: T2, choice: "a" })).status, 409);

  console.log("3. Trace басталды");
  await mockPost("/__patch", { table: "rounds", id: R1, set: { status: "running", started_at: iso(0), ends_at: iso(20 * 60_000) } });
  await sleep(2200);
  st = await call(s1.cookie, "GET", "/api/contest/state?full=1");
  expect("белсенді — 1-кезең mcq", [st.data?.active?.idx, st.data?.active?.kind], [1, "mcq"]);
  const v1 = st.data?.active?.variant;
  truthy("A/B нұсқасы берілді", v1 === "A" || v1 === "B", String(v1));
  const ids = st.data?.active?.tasks?.map((t) => t.id) ?? [];
  expect("тек өз нұсқасы + ортақ сұрақ", ids.length, 2);
  truthy("жауап кілті шықпайды", !/"correct"|SECRET_SOLUTION|tests_hidden/.test(st.text), "correct/solution табылды");
  const st2 = await call(s1.cookie, "GET", "/api/contest/state?full=1");
  expect("нұсқа тұрақты", st2.data?.active?.variant, v1);

  const myT1 = v1 === "A" ? T1A : T1B, otherT1 = v1 === "A" ? T1B : T1A;
  const right1 = v1 === "A" ? "b" : "c";
  expect("бөтен нұсқаның сұрағы → 403", (await call(s1.cookie, "POST", "/api/contest/answer", { taskId: otherT1, choice: "a" })).status, 403);
  expect("жоқ нұсқа 'z' → 400", (await call(s1.cookie, "POST", "/api/contest/answer", { taskId: T2, choice: "z" })).status, 400);
  let r = await call(s1.cookie, "POST", "/api/contest/answer", { taskId: myT1, choice: right1 });
  expect("дұрыс жауап сақталды", r.data, { ok: true, saved: true });
  truthy("жауапта дұрыс/бұрыс айтылмайды", !/correct/.test(r.text), r.text);
  await sleep(300);
  await call(s1.cookie, "POST", "/api/contest/answer", { taskId: T2, choice: "b" }); // қате
  await sleep(300);
  await call(s1.cookie, "POST", "/api/contest/answer", { taskId: T2, choice: "a" }); // өзгертті → дұрыс
  expect("Debug тапсырмасына Trace кезінде → 409", (await call(s1.cookie, "POST", "/api/contest/answer", { taskId: D11, choice: "a" })).status, 409);
  expect("тым жиі басу → 429", await (async () => { await call(s1.cookie, "POST", "/api/contest/answer", { taskId: T2, choice: "a" }); return (await call(s1.cookie, "POST", "/api/contest/answer", { taskId: T2, choice: "a" })).status; })(), 429);

  const st2v = (await call(s2.cookie, "GET", "/api/contest/state?full=1")).data?.active?.variant;
  const s2T1 = st2v === "A" ? T1A : T1B;
  await call(s2.cookie, "POST", "/api/contest/answer", { taskId: s2T1, choice: "d" }); // қате

  st = await call(s1.cookie, "GET", "/api/contest/state?full=1");
  expect("соңғы жауаптар қайтарылады", [st.data?.active?.mine?.[myT1]?.answer, st.data?.active?.mine?.[T2]?.answer], [right1, "a"]);

  await sleep(8200);
  st = await call(s1.cookie, "GET", "/api/contest/state");
  expect("Trace жүріп жатқанда ұпай ашылмайды", st.data?.me?.score ?? 0, 0);
  expect("лидербордта да Trace ұпайы жоқ", (await call("", "GET", "/api/board")).data?.rows?.length, 0);

  await mockPost("/__patch", { table: "rounds", id: R1, set: { status: "closed", ends_at: iso(-10_000) } });
  await sleep(8200);
  let rank = await fetch(MOCK + "/__rank?c=" + C).then((x) => x.json());
  expect("Trace жабылған соң: s1 — 2 ұпай (соңғы жауап есептелді)", rank[0]?.score, 2);
  st = await call(s1.cookie, "GET", "/api/contest/state");
  expect("оқушы өз орнын көреді", st.data?.me, { rank: 1, score: 2, total: 2 });

  console.log("3б. Бақылау дерегі");
  const act = { hidden_count: 2, hidden_ms: 9000, blur_count: 1, blur_ms: 500, tasks: { [T2]: { keys: 12, dels: 3, blocked: 1, checks: 0, check_fails: 0, pauses: 0, active_ms: 4000, think_ms: 1500 } } };
  expect("кірмеген адамнан қабылданбайды → 401", (await call("", "POST", "/api/contest/activity", { roundId: R1, data: act })).status, 401);
  r = await call(s1.cookie, "POST", "/api/contest/activity", { roundId: R1, data: { ...act, evil: "<script>", hidden_ms: -5, tasks: { ...act.tasks, "жаман-кілт": { keys: 1 }, [T1A]: { keys: 1e12, dels: "көп" } } } });
  expect("ашық кезеңнің дерегі сақталады", r.data, { ok: true, stored: true });
  let saved = (await fetch(MOCK + "/__db").then((x) => x.json())).activity;
  expect("бір оқушыға бір кезеңге бір жол", saved.length, 1);
  truthy("бөтен өрістер мен жарамсыз кілттер алынады", !("evil" in saved[0].data) && !("жаман-кілт" in saved[0].data.tasks), JSON.stringify(saved[0].data));
  expect("мәндер шектеледі", [saved[0].data.hidden_ms, saved[0].data.tasks[T1A].keys, saved[0].data.tasks[T1A].dels, saved[0].data.tasks[T2].blocked], [0, 1000000, 0, 1]);
  expect("тым жиі жіберілсе — еленбейді", (await call(s1.cookie, "POST", "/api/contest/activity", { roundId: R1, data: act })).data, { ok: true, stored: false });
  expect("басталмаған кезеңнің дерегі сақталмайды", (await call(s2.cookie, "POST", "/api/contest/activity", { roundId: R3, data: act })).data, { ok: true, stored: false });
  await sleep(4200);
  await call(s1.cookie, "POST", "/api/contest/activity", { roundId: R1, data: act });
  saved = (await fetch(MOCK + "/__db").then((x) => x.json())).activity;
  expect("қайта жіберілсе — сол жол жаңарады", [saved.length, saved[0].data.hidden_count, saved[0].data.hidden_ms], [1, 2, 9000]);
  st = await call(s1.cookie, "GET", "/api/contest/state?full=1");
  truthy("бақылау дерегі мен ЖИ үлгілері оқушыға қайтарылмайды", !/hidden_count|ai_refs/.test(st.text));

  console.log("4. Debug басталды (Trace жабылды)");
  await mockPost("/__patch", { table: "rounds", id: R1, set: { status: "closed", ends_at: iso(-10_000) } });
  await mockPost("/__patch", { table: "rounds", id: R2, set: { status: "running", started_at: iso(0), ends_at: iso(30 * 60_000) } });
  await sleep(2200);
  expect("жабық Trace-ке жауап → 409", (await call(s1.cookie, "POST", "/api/contest/answer", { taskId: T2, choice: "b" })).status, 409);
  st = await call(s1.cookie, "GET", "/api/contest/state?full=1");
  expect("белсенді — debug", st.data?.active?.kind, "debug");
  const d = st.data?.active?.tasks?.[0];
  expect("оқушыға ашық мысал мен шаблон бар", [d?.entry, d?.max_changed_lines, d?.tests_public?.length, d?.starter_code === STARTER], ["f", 1, 1, true]);
  truthy("жасырын тест жауаптары шықпайды", !/tests_hidden|SECRET_SOLUTION/.test(st.text) && !st.text.includes('"expected":"10"'));

  let ch = await call(s1.cookie, "POST", "/api/contest/challenge", { taskId: D11 });
  truthy("челлендж: токен + 3 кіріс", ch.data?.token && ch.data?.inputs?.length === 3, ch.text);
  truthy("челленджде дұрыс шығыс жоқ", !ch.text.includes("expected"), ch.text);
  const answerFor = (hidden) => (inp) => hidden.find((h) => JSON.stringify(h.args) === JSON.stringify(inp)).expected;
  const FIXED = STARTER.replace("return s + 1", "return s");
  r = await call(s1.cookie, "POST", "/api/contest/submit", { taskId: D11, token: ch.data.token, code: FIXED, outputs: ch.data.inputs.map(answerFor(D11_HIDDEN)) });
  expect("дұрыс шығыстар → correct: true", r.data, { ok: true, correct: true });

  await sleep(1600);
  ch = await call(s1.cookie, "POST", "/api/contest/challenge", { taskId: D11 });
  r = await call(s1.cookie, "POST", "/api/contest/submit", { taskId: D11, token: ch.data.token, code: STARTER.replace("s = 0", "s = 1").replace("return s + 1", "return s"), outputs: ch.data.inputs.map(answerFor(D11_HIDDEN)) });
  expect("2 жол өзгерсе → 422, себебі айтылады", [r.status, r.data?.reason], [422, "lines"]);
  truthy("ереже бұзылған жіберілім сақталмайды", (await fetch(MOCK + "/__db").then((x) => x.json())).submissions.filter((s) => s.task_id === D11).length === 1);

  await sleep(1600);
  ch = await call(s2.cookie, "POST", "/api/contest/challenge", { taskId: D11 });
  r = await call(s2.cookie, "POST", "/api/contest/submit", { taskId: D11, token: ch.data.token, code: STARTER, outputs: ch.data.inputs.map(() => "999") });
  expect("қате шығыс → correct: false", r.data, { ok: true, correct: false });
  r = await call(s1.cookie, "POST", "/api/contest/submit", { taskId: D11, token: ch.data.token, code: FIXED, outputs: ["1", "10", "0"] });
  expect("басқа оқушының токені → 400", r.status, 400);
  await sleep(1600);
  r = await call(s2.cookie, "POST", "/api/contest/submit", { taskId: D11, token: "x.y", code: FIXED, outputs: ["1"] });
  expect("жалған токен → 400", r.status, 400);

  console.log("5. Уақыт және жеке +5 мин");
  await sleep(1600);
  const chLate = await call(s2.cookie, "POST", "/api/contest/challenge", { taskId: D11 });
  await mockPost("/__patch", { table: "rounds", id: R2, set: { ends_at: iso(-7_000) } });
  await sleep(2200);
  r = await call(s2.cookie, "POST", "/api/contest/submit", { taskId: D11, token: chLate.data.token, code: FIXED, outputs: chLate.data.inputs.map(answerFor(D11_HIDDEN)) });
  expect("уақыт + 5 с грейс өткен соң → 409", r.status, 409);
  await mockPost("/__seed", { round_extensions: [{ round_id: R2, student_id: (await fetch(MOCK + "/__db").then((x) => x.json())).students.find((x) => x.email === "s2@mock.test").id, extra_min: 5 }] });
  await sleep(5200);
  st = await call(s2.cookie, "GET", "/api/contest/state");
  expect("+5 мин алған оқушыда кезең ашық", st.data?.active?.kind, "debug");
  expect("басқаларда жабық", (await call(s1.cookie, "GET", "/api/contest/state")).data?.active, null);
  r = await call(s2.cookie, "POST", "/api/contest/submit", { taskId: D11, token: chLate.data.token, code: FIXED, outputs: chLate.data.inputs.map(answerFor(D11_HIDDEN)) });
  expect("+5 мин ішінде жіберу өтті", r.data, { ok: true, correct: true });

  console.log("6. Build және тыйым салынған конструкция");
  await mockPost("/__patch", { table: "rounds", id: R2, set: { status: "closed" } });
  await mockPost("/__patch", { table: "rounds", id: R3, set: { status: "running", started_at: iso(0), ends_at: iso(20 * 60_000) } });
  await mockPost("/__seed", { round_extensions: [] });
  await sleep(5200);
  st = await call(s1.cookie, "GET", "/api/contest/state?full=1");
  expect("белсенді — code", st.data?.active?.kind, "code");
  ch = await call(s1.cookie, "POST", "/api/contest/challenge", { taskId: B15 });
  r = await call(s1.cookie, "POST", "/api/contest/submit", { taskId: B15, token: ch.data.token, code: "def g(a):\n    return len(set(a))\n", outputs: ch.data.inputs.map(answerFor(B15_HIDDEN)) });
  expect("set( → 422 forbidden", [r.status, r.data?.reason], [422, "forbidden"]);
  await sleep(1600);
  ch = await call(s1.cookie, "POST", "/api/contest/challenge", { taskId: B15 });
  r = await call(s1.cookie, "POST", "/api/contest/submit", { taskId: B15, token: ch.data.token, code: "def g(a):\n    return len({x: 1 for x in a})\n", outputs: ch.data.inputs.map(answerFor(B15_HIDDEN)) });
  expect("Build дұрыс → correct", r.data, { ok: true, correct: true });

  console.log("7. Лидерборд");
  await sleep(8200);
  let b = await call("", "GET", "/api/board");
  expect("лидерборд Supabase-тен", [b.data?.locked, b.data?.rows?.[0]?.score, b.data?.total], [false, 9, 2]);
  truthy("лидербордта student_id шықпайды", !b.text.includes("student_id"));
  await mockPost("/__patch", { table: "rounds", id: R3, set: { ends_at: iso(5 * 60_000) } });
  await sleep(2200);
  b = await call("", "GET", "/api/board");
  expect("соңғы 10 минутта автоматты жабылады", [b.data?.locked, b.data?.rows?.length], [true, 0]);
  expect("оқушының өз орны да жасырылады", (await call(s1.cookie, "GET", "/api/contest/state")).data?.me, null);
  await mockPost("/__patch", { table: "rounds", id: R3, set: { ends_at: iso(20 * 60_000) } });
  await mockPost("/__patch", { table: "contests", id: C, set: { board_locked: true } });
  await sleep(3200);
  b = await call("", "GET", "/api/board");
  expect("әкімші қолмен жапты", b.data?.locked, true);

  console.log(`\n${pass} өтті, ${fail} өтпеді`);
  stop();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); stop(); process.exit(1); });

// mockService (lib/client/mock): бэкендсіз режимнің ағыны — тіркелу, кіру, әкімші операциялары, Trace/Debug/Build.
import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";

// Браузердің localStorage-ын жадта имитациялаймыз (mock деректері сонда тұрады)
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  location: { href: "", origin: "http://localhost" },
};
(globalThis as Record<string, unknown>).localStorage = (globalThis as { window: { localStorage: unknown } }).window.localStorage;
(globalThis as Record<string, unknown>).location = { origin: "http://localhost" };

const { mockApi: api } = await import("../../lib/client/mock/index.ts");
const reg = { lastName: "Ілиясова", firstName: "Аружан", university: "Мок колледжі", course: "1 курс", phone: "", email: "aruzhan@mock.test", password: "fixture-pass-1" };

beforeEach(() => store.clear());

test("тіркелу: өріс қатесі, сәтті тіркелу, қайталанған email → 409", async () => {
  assert.deepEqual([(await api.auth.register({ ...reg, course: "7 курс" })).status, (await api.auth.register({ ...reg, course: "7 курс" })).data.field], [400, "course"]);
  const r = await api.auth.register(reg);
  assert.equal(r.status, 200);
  const me = await api.auth.me();
  assert.ok(me.loggedIn && me.profile.emailMasked === "ar•••@mock.test" && me.name === "Ілиясова Аружан");
  await api.auth.logout();
  assert.equal((await api.auth.register(reg)).status, 409);
});

test("кіру: қате құпия сөз 401, әкімші аккаунты студент ретінде 403, қалпына келтіру токені бір рет", async () => {
  assert.equal((await api.auth.login("demo@mock.test", "nope-nope")).status, 401);
  assert.equal((await api.auth.login("admin@mock.test", "admin-pass-1")).status, 403);
  assert.equal((await api.auth.login(" DEMO@mock.test ", "demo-pass-1")).status, 200);
  const info = console.info;
  let link = "";
  console.info = (m: string) => (link = m);
  assert.deepEqual((await api.auth.forgot("demo@mock.test")).data, { ok: true, sent: true });
  assert.deepEqual((await api.auth.forgot("nobody@mock.test")).data, { ok: true, sent: true });
  console.info = info;
  const token = /token_hash=([^&]+)/.exec(link)![1];
  assert.equal((await api.auth.reset(token, "short")).status, 400);
  assert.equal((await api.auth.reset(token, "new-pass-123")).status, 200);
  assert.equal((await api.auth.reset(token, "new-pass-456")).status, 400); // бір рет қана
  assert.equal((await api.auth.login("demo@mock.test", "new-pass-123")).status, 200);
});

test("әкімші: студент сессиясы әкімші емес; жарыс құру, қайталанған кілт 409, тапсырма 409", async () => {
  await api.auth.login("demo@mock.test", "demo-pass-1");
  assert.equal(await api.admin.me(), null);
  await assert.rejects(api.admin.contests(), { status: 401 });
  await assert.rejects(api.admin.login("demo@mock.test", "demo-pass-1"), { status: 403 });
  await api.admin.login("admin@mock.test", "admin-pass-1");
  const c = await api.admin.createContest({ slug: "2026-11", title: "Қараша", starts_at: "2026-11-01T10:00:00Z" });
  await assert.rejects(api.admin.createContest({ slug: "2026-11", title: "x", starts_at: "2026-11-01T10:00:00Z" }), { status: 409 });
  const b = await api.admin.contest(c.id);
  assert.deepEqual(b.rounds.map((r) => [r.kind, r.duration_min]), [["mcq", 20], ["debug", 30], ["code", 20]]);
  const base = { round_id: b.rounds[0].id, idx: 1, title: "t", statement: "", points: 1, options: [{ key: "a", text: "1" }, { key: "b", text: "2" }], correct: "a",
    starter_code: null, solution_code: null, variant: null, image_url: null, entry: null, max_changed_lines: null, forbidden: [], ai_refs: [], tests_public: [], tests_hidden: [] };
  await api.admin.createTask(base);
  await assert.rejects(api.admin.createTask(base), { status: 409 });
  await assert.rejects(api.admin.extendRound(b.rounds[0].id, 5), { status: 409 }); // жүріп тұрған жоқ
});

test("жарыс ағыны: Trace жауабы, Debug ережесі 422, дұрыс жіберілім, рейтинг, жеке +5 мин", async () => {
  await api.admin.login("admin@mock.test", "admin-pass-1");
  const [demo] = await api.admin.contests();
  const b = await api.admin.contest(demo.id);
  await api.auth.login("demo@mock.test", "demo-pass-1");
  const before = await api.contest.state(false);
  assert.equal(before!.active, null);
  assert.equal((await api.public.board()).idle, true);

  await api.admin.startRound(b.rounds[0].id);
  const st = await api.contest.state(true);
  assert.ok(st!.active && "tasks" in st!.active);
  const full = st!.active as Extract<typeof st.active, { tasks: unknown }>;
  const q = full.tasks.find((t) => t.idx === 2)!;
  assert.ok(!JSON.stringify(full.tasks).includes("correct"));
  assert.equal((await api.contest.answer(q.id, "z")).status, 400);
  assert.equal((await api.contest.answer(q.id, "a")).status, 200);
  const other = b.tasks.find((t) => t.idx === 1 && t.variant && t.variant !== full.variant)!;
  assert.equal((await api.contest.answer(other.id, "a")).status, 403);

  await api.admin.startRound(b.rounds[1].id); // Trace жабылады, Debug ашылады
  const rounds = (await api.admin.contest(demo.id)).rounds;
  assert.deepEqual(rounds.map((r) => r.status), ["closed", "running", "pending"]);
  const d11 = b.tasks.find((t) => t.idx === 11)!;
  const ch = await api.contest.challenge(d11.id);
  assert.equal(ch.status, 200);
  const twoLines = d11.starter_code!.replace("s = 0", "s = 1").replace("return s + 1", "return s");
  assert.equal((await api.contest.submit({ taskId: d11.id, token: ch.data.token, code: twoLines, outputs: [] })).status, 422);
  const fixed = d11.starter_code!.replace("return s + 1", "return s");
  const outputs = ch.data.inputs.map((args) => String((args[0] as number[]).reduce((a, x) => a + x, 0)));
  const ok = await api.contest.submit({ taskId: d11.id, token: ch.data.token, code: fixed, outputs });
  assert.deepEqual([ok.status, ok.data.correct], [200, true]);

  const rank = await api.admin.ranking(demo.id);
  assert.equal(rank[0].name, "Демо Студент");
  assert.equal(rank[0].score, 1 + 3); // Trace (жабылды) + Debug
  const hits = await api.admin.searchStudents("Демо");
  assert.equal((await api.admin.extendStudent(rounds[1].id, hits[0].id)).extra_min, 5);
  assert.equal((await api.admin.operator(demo.id)).extensions[0].extra_min, 5);
  assert.equal((await api.admin.analysis(demo.id)).subs.length, 2); // 400/403/422 сақталмайды
});

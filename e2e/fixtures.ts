import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Playwright тесттерінің ортақ дерегі мен көмекшілері (#56).
 * Әр тест таза дерекқордан басталады (hooks фикстурасы reset жасайды) және өз дерегін test hooks арқылы бір рет
 * seed етеді: seed берілген кестелерді толық алмастырады, сондықтан студенттер мен әкімші бір шақыруда беріледі.
 * Дерек ойдан шығарылған, email-дер @mock.test.
 */

export const PASSWORD = "fixture-pass";
/** compose.e2e.yml-дегі тест әкімшісі (seed арқылы құрылады — reset оны да өшіреді). */
export const ADMIN = { email: "admin@mock.test", password: "admin-pass-123" };

export const ID = {
  contest: "10000000-0000-4000-8000-000000000001",
  r1: "20000000-0000-4000-8000-000000000001",
  r2: "20000000-0000-4000-8000-000000000002",
  r3: "20000000-0000-4000-8000-000000000003",
  t1a: "30000000-0000-4000-8000-00000000001a",
  t1b: "30000000-0000-4000-8000-00000000001b",
  t2: "30000000-0000-4000-8000-000000000002",
  t3: "30000000-0000-4000-8000-000000000003",
  d11: "30000000-0000-4000-8000-000000000011",
  b15: "30000000-0000-4000-8000-000000000015",
  s1: "b1000000-0000-4000-8000-000000000001",
  s2: "b2000000-0000-4000-8000-000000000002",
  s3: "b3000000-0000-4000-8000-000000000003",
  admin: "a0000000-0000-4000-8000-000000000001",
};

export type Student = { id: string; email: string; last_name: string; first_name: string; full_name: string; university: string; course: string | null; phone: string | null };
export const S1: Student = { id: ID.s1, email: "s1@mock.test", last_name: "Серіков", first_name: "Айдос", full_name: "Серіков Айдос", university: "Мок университеті", course: "2 курс", phone: "+77010000001" };
export const S2: Student = { id: ID.s2, email: "s2@mock.test", last_name: "Қайрат", first_name: "Бота", full_name: "Қайрат Бота", university: "Мок колледжі", course: "1 курс", phone: null };
export const S3: Student = { id: ID.s3, email: "s3@mock.test", last_name: "Омаров", first_name: "Ержан", full_name: "Омаров Ержан", university: "Мок университеті", course: "3 курс", phone: null };

export const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

type RoundState = { status: "pending" | "running" | "closed"; started_at: string | null; ends_at: string | null };
export const pending = (): RoundState => ({ status: "pending", started_at: null, ends_at: null });
export const running = (minutesLeft = 20): RoundState => ({ status: "running", started_at: iso(-60_000), ends_at: iso(minutesLeft * 60_000) });
export const closed = (): RoundState => ({ status: "closed", started_at: iso(-3_600_000), ends_at: iso(-2_400_000) });

const OPTS = [{ key: "a", text: "1" }, { key: "b", text: "2" }, { key: "c", text: "3" }, { key: "d", text: "4" }];
/** Debug: соңғы жолда «+ 1» артық — бір жолды түзету керек. */
export const DEBUG_STARTER = "def f(a):\n    s = 0\n    for x in a:\n        s += x\n    return s + 1\n";
export const BUILD_STARTER = "def g(a):\n    pass\n";

function task(id: string, round_id: string, idx: number, extra: Record<string, unknown>) {
  return {
    id, round_id, idx, title: `Тапсырма ${idx}`, statement: "Шартты оқып, жауап бер.", points: 1, options: null, correct: null, starter_code: null,
    solution_code: "SECRET_SOLUTION", entry: null, max_changed_lines: null, forbidden: [], ai_refs: [], variant: null, image_url: null,
    tests_public: [], tests_hidden: [], ...extra,
  };
}

export type ContestOptions = {
  startsIn?: number;
  status?: "draft" | "published" | "running" | "finished";
  boardLocked?: boolean;
  title?: string;
  r1?: RoundState;
  r2?: RoundState;
  r3?: RoundState;
};

/** Үш кезеңді жарыс: Trace (A/B нұсқалы 1-сұрақ + ортақ 2, 3), Debug (f), Build (g, set( тыйым). */
export function contest(o: ContestOptions = {}) {
  const round = (id: string, idx: number, kind: string, title: string, st: RoundState = pending()) =>
    ({ id, contest_id: ID.contest, idx, kind, title, duration_min: 20, ...st });
  return {
    contests: [{ id: ID.contest, slug: "test-1", title: o.title ?? "Тест жарысы", starts_at: iso(o.startsIn ?? 3 * 3_600_000), status: o.status ?? "published", board_locked: o.boardLocked ?? false, board_autolock_min: 10 }],
    rounds: [round(ID.r1, 1, "mcq", "Trace — кодты оқу", o.r1), round(ID.r2, 2, "debug", "Debug — қатені түзет", o.r2), round(ID.r3, 3, "code", "Build — өзің жаз", o.r3)],
    tasks: [
      task(ID.t1a, ID.r1, 1, { title: "Цикл нәтижесі", statement: "A нұсқасының сұрағы", options: OPTS, correct: "b", variant: "A" }),
      task(ID.t1b, ID.r1, 1, { title: "Цикл нәтижесі", statement: "B нұсқасының сұрағы", options: OPTS, correct: "c", variant: "B" }),
      task(ID.t2, ID.r1, 2, { title: "Тізім ұзындығы", statement: "Ортақ сұрақ", options: OPTS, correct: "a" }),
      task(ID.t3, ID.r1, 3, { title: "Жол кесіндісі", statement: "Ортақ сұрақ", options: OPTS, correct: "d" }),
      task(ID.d11, ID.r2, 1, {
        title: "Қосынды", statement: "Тізімнің қосындысын қайтаратын функцияда бір қате бар.", points: 3, entry: "f", starter_code: DEBUG_STARTER, max_changed_lines: 1,
        tests_public: [{ args: [[1, 2]], expected: "3" }], tests_hidden: [{ args: [[1]], expected: "1" }, { args: [[5, 5]], expected: "10" }, { args: [[]], expected: "0" }],
      }),
      task(ID.b15, ID.r3, 1, {
        title: "Бірегейлер саны", statement: "Тізімдегі әр түрлі мәндердің санын қайтар.", points: 4, entry: "g", starter_code: BUILD_STARTER, forbidden: ["set("],
        tests_public: [{ args: [[1, 1, 2]], expected: "2" }], tests_hidden: [{ args: [[1, 1, 2]], expected: "2" }, { args: [["a", "b", "a"]], expected: "2" }, { args: [[]], expected: "0" }],
      }),
    ],
  };
}

export const users = (students: Student[] = [S1, S2], admin = false) => [
  ...students.map((s) => ({ ...s, password: PASSWORD })),
  ...(admin ? [{ id: ID.admin, email: ADMIN.email, password: ADMIN.password, role: "admin", full_name: "Әкімші", university: "" }] : []),
];

export type Dump = Record<string, Record<string, unknown>[]>;

/** /api/test-hooks/* (тек E2E_TEST_HOOKS=1 стекте). */
export class Hooks {
  constructor(private api: APIRequestContext) {}
  private async post(action: string, body: unknown = {}) {
    const r = await this.api.post(`/api/test-hooks/${action}`, { data: body });
    expect(r.status(), `test hook ${action}`).toBe(200);
  }
  reset() {
    return this.post("reset");
  }
  seed(data: Record<string, unknown[]>) {
    return this.post("seed", data);
  }
  patch(table: string, id: string, set: Record<string, unknown>) {
    return this.post("patch", { table, id, set });
  }
  async dump(): Promise<Dump> {
    return (await this.api.get("/api/test-hooks/dump")).json();
  }
  async outbox(): Promise<{ to: string; link: string; subject?: string }[]> {
    return (await this.api.get("/api/test-hooks/outbox")).json();
  }
}

/** Студент ретінде кіру: page.request браузер контекстінің cookie-лерін бөліседі. */
export async function loginAs(page: Page, email: string, password = PASSWORD) {
  const r = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(r.status(), `login ${email}`).toBe(200);
}

export async function adminLogin(page: Page) {
  const r = await page.request.post("/api/admin/auth/login", { data: ADMIN });
  expect(r.status(), "admin login").toBe(200);
}

/** 375 px-те беттің көлденең айналымы жоқ. */
export async function expectNoHorizontalScroll(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

/**
 * CodeMirror-ға код теру: әр жол ≤ 40 таңбалық бөліктермен (көшіру-қоюдан қорғаныс), Enter-ден кейін редактор
 * қойған шегініс алынып, жолдың өз шегінісі жазылады.
 */
export async function typeCode(page: Page, code: string) {
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  const lines = code.replace(/\n$/, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      await page.keyboard.press("Enter");
      await page.keyboard.press("Shift+Home");
    }
    for (let k = 0; k < lines[i].length; k += 40) await page.keyboard.insertText(lines[i].slice(k, k + 40));
  }
}

export const editorText = (page: Page) => page.locator(".cm-content").evaluate((el) => (el as HTMLElement).innerText.replace(/\u00a0/g, " "));

type Fixtures = { hooks: Hooks };

export const test = base.extend<Fixtures>({
  // Әр тест таза дерекқордан басталады (auto: тест hooks-ты сұрамаса да). Reset rate-limit санағыштарын да тазартады,
  // сондықтан бөгде тақырып (X-Forwarded-For) керек емес — ол CDN-ге (Pyodide) баратын CORS сұраныстарын бұзады.
  hooks: [
    async ({ request }, use) => {
      const h = new Hooks(request);
      await h.reset();
      await use(h);
    },
    { auto: true },
  ],
});

export { expect };

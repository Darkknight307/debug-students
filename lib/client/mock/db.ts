/**
 * mockService деректері: браузердің localStorage-ында (студент қойындысы мен әкімші қойындысы бір деректі көреді).
 * Бұл — тек демо: құпия сөздер ашық сақталады, ештеңе браузерден шықпайды.
 */
import type { AdminContest, AdminRound, AdminTask, Kind, TestCase } from "../types";

export type MockUser = {
  id: string;
  email: string;
  password: string;
  role: "student" | "admin";
  last_name: string;
  first_name: string;
  full_name: string;
  university: string;
  course: string | null;
  phone: string | null;
  first_login_at: string;
};
export type MockSubmission = {
  id: number;
  contest_id: string;
  round_id: string;
  task_id: string;
  student_id: string;
  answer: string | null;
  code: string | null;
  is_correct: boolean;
  points: number;
  created_at: string;
};
export type MockDb = {
  version: 1;
  users: MockUser[];
  contests: AdminContest[];
  rounds: AdminRound[];
  tasks: AdminTask[];
  submissions: MockSubmission[];
  variants: { contest_id: string; student_id: string; variant: "A" | "B" }[];
  extensions: { round_id: string; student_id: string; extra_min: number }[];
  activity: { round_id: string; student_id: string; contest_id: string; data: Record<string, unknown> }[];
  resetTokens: { token: string; user_id: string; expires_at: number }[];
  seq: number;
};

const KEY = "debug-mock-db-v1";
export const SESSION_KEY = "debug-mock-session";
export const ADMIN_KEY = "debug-mock-admin";

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));

const iso = (ms: number) => new Date(ms).toISOString();
const t = (args: unknown[], expected: string): TestCase => ({ args, expected });

function task(round_id: string, idx: number, kind: Kind, extra: Partial<AdminTask>): AdminTask {
  return {
    id: uid(), round_id, idx, title: "", statement: "", points: kind === "mcq" ? 1 : kind === "debug" ? 3 : 4,
    options: null, correct: null, starter_code: null, solution_code: null, variant: null, image_url: null,
    entry: null, max_changed_lines: kind === "debug" ? 1 : null, forbidden: [], ai_refs: [], tests_public: [], tests_hidden: [],
    ...extra,
  };
}
const opts = (a: string[]) => a.map((text, i) => ({ key: "abcd"[i], text }));

/** Бірінші ашылғанда: демо аккаунттар және «DEBUG · Демо» жарысы (ойдан шығарылған тапсырмалар). */
export function seed(now = Date.now()): MockDb {
  const C = uid();
  const R = [uid(), uid(), uid()];
  const at = iso(now - 3_600_000);
  return {
    version: 1,
    seq: 0,
    users: [
      { id: uid(), email: "demo@mock.test", password: "demo-pass-1", role: "student", last_name: "Демо", first_name: "Студент", full_name: "Демо Студент", university: "Мок университеті", course: "2 курс", phone: null, first_login_at: at },
      { id: uid(), email: "admin@mock.test", password: "admin-pass-1", role: "admin", last_name: "", first_name: "", full_name: "Әкімші", university: "", course: null, phone: null, first_login_at: at },
      ...["Серіков Айдос", "Қайрат Бота", "Нұрланов Ерасыл"].map((n, i) => ({
        id: uid(), email: `s${i + 1}@mock.test`, password: "fixture-pass-1", role: "student" as const,
        last_name: n.split(" ")[0], first_name: n.split(" ")[1], full_name: n, university: i % 2 ? "Мок колледжі" : "Мок университеті",
        course: `${i + 1} курс`, phone: null, first_login_at: iso(now - (3 - i) * 600_000),
      })),
    ],
    contests: [{ id: C, slug: "demo", title: "DEBUG · Демо", starts_at: iso(now + 3_600_000), status: "published", board_locked: false, board_autolock_min: 10 }],
    rounds: [
      { id: R[0], contest_id: C, idx: 1, kind: "mcq", title: "Trace — кодты оқу", duration_min: 20, status: "pending", started_at: null, ends_at: null },
      { id: R[1], contest_id: C, idx: 2, kind: "debug", title: "Debug — қатені түзет", duration_min: 30, status: "pending", started_at: null, ends_at: null },
      { id: R[2], contest_id: C, idx: 3, kind: "code", title: "Build — өзің жаз", duration_min: 20, status: "pending", started_at: null, ends_at: null },
    ],
    tasks: [
      task(R[0], 1, "mcq", { variant: "A", title: "Цикл", correct: "b", options: opts(["3", "6", "10", "Қате шығады"]),
        statement: "Код не шығарады?\n```python\ns = 0\nfor i in range(1, 4):\n    s += i\nprint(s)\n```" }),
      task(R[0], 1, "mcq", { variant: "B", title: "Цикл", correct: "c", options: opts(["1", "4", "6", "24"]),
        statement: "Код не шығарады?\n```python\ns = 1\nfor i in range(1, 4):\n    s *= i\nprint(s)\n```" }),
      task(R[0], 2, "mcq", { title: "Тізім кесіндісі", correct: "a", options: opts(["[3, 8]", "[5, 3]", "[3, 8, 1]", "[8, 1]"]),
        statement: "Код не шығарады?\n```python\na = [5, 3, 8, 1]\nprint(a[1:3])\n```" }),
      task(R[0], 3, "mcq", { title: "Жол", correct: "d", options: opts(["debug", "DEBUG", "gubed", "GUBED"]),
        statement: "Код не шығарады?\n```python\ns = \"debug\"\nprint(s[::-1].upper())\n```" }),
      task(R[1], 11, "debug", { title: "Қосынды", entry: "total",
        statement: "Функция тізімдегі сандардың қосындысын қайтаруы керек. Бір жолды түзет.",
        starter_code: "def total(a):\n    s = 0\n    for x in a:\n        s += x\n    return s + 1\n",
        solution_code: "def total(a):\n    s = 0\n    for x in a:\n        s += x\n    return s\n",
        tests_public: [t([[1, 2]], "3"), t([[]], "0")], tests_hidden: [t([[1]], "1"), t([[5, 5]], "10"), t([[-2, 2]], "0")] }),
      task(R[1], 12, "debug", { title: "Ең үлкені", entry: "biggest", statement: "Тізімдегі ең үлкен санды қайтар.",
        starter_code: "def biggest(a):\n    m = 0\n    for x in a:\n        if x > m:\n            m = x\n    return m\n",
        solution_code: "def biggest(a):\n    m = a[0]\n    for x in a:\n        if x > m:\n            m = x\n    return m\n",
        tests_public: [t([[1, 7, 3]], "7")], tests_hidden: [t([[-5, -2, -9]], "-2"), t([[4]], "4")] }),
      task(R[2], 15, "code", { title: "Бірегейлер", entry: "uniq", forbidden: ["set("],
        statement: "Тізімдегі әртүрлі элементтер санын қайтар. set() қолдануға болмайды.",
        starter_code: "def uniq(a):\n    # кодыңды осында жаз\n    pass\n",
        solution_code: "def uniq(a):\n    seen = []\n    for x in a:\n        if x not in seen:\n            seen.append(x)\n    return len(seen)\n",
        tests_public: [t([[1, 1, 2]], "2")], tests_hidden: [t([["a", "b", "a"]], "2"), t([[]], "0"), t([[3, 3, 3]], "1")] }),
    ],
    submissions: [],
    variants: [],
    extensions: [],
    activity: [],
    resetTokens: [],
  };
}

const hasStorage = () => typeof window !== "undefined" && !!window.localStorage;

export function load(): MockDb {
  if (!hasStorage()) return seed();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as MockDb;
      if (db.version === 1) return db;
    }
  } catch {
    /* бүлінген дерек — қайта құрамыз */
  }
  const db = seed();
  save(db);
  return db;
}

export function save(db: MockDb) {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* толып кетсе (суреттер) — демо үшін елемейміз */
  }
}

export function session(key: string): string | null {
  if (!hasStorage()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setSession(key: string, value: string | null) {
  if (!hasStorage()) return;
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* жеке режим */
  }
}

/** UI-дағы «жүктелуде» күйлері көрінуі үшін шағын кідіріс. */
export const delay = (ms = 150 + Math.random() * 150) => new Promise((r) => setTimeout(r, ms));

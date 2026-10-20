// Браузерде тексеру үшін мок дерекқорды толтырады және студент cookie-ін шығарады.
// node tests/contest/seed-ui.mjs [round-idx-to-start]
import { signSession } from "../../lib/session.ts";

process.env.SESSION_SECRET ||= "e2e-secret-e2e-secret-e2e-secret-000";
const MOCK = "http://127.0.0.1:4466";
const startIdx = Number(process.argv[2] || 1);
const iso = (ms) => new Date(Date.now() + ms).toISOString();

const C = "10000000-0000-4000-8000-000000000001";
const SID = "50000000-0000-4000-8000-000000000001";
const UID = "b1000000-0000-4000-8000-000000000001"; // mock-db.mjs-тегі s1@mock.test
const R = ["", "20000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000002", "20000000-0000-4000-8000-000000000003"];
const opts = (a) => a.map((text, i) => ({ key: "abcd"[i], text }));
const round = (idx, kind, title, dur) => ({
  id: R[idx], contest_id: C, idx, kind, title, duration_min: dur,
  status: idx < startIdx ? "closed" : idx === startIdx ? "running" : "pending",
  started_at: idx <= startIdx ? iso(-60_000) : null,
  ends_at: idx < startIdx ? iso(-30_000) : idx === startIdx ? iso(dur * 60_000) : null,
});
const base = { statement: "", points: 1, options: null, correct: null, starter_code: null, solution_code: null, entry: null, max_changed_lines: null, forbidden: [], variant: null, image_url: null, tests_public: [], tests_hidden: [] };

const tasks = [
  { ...base, id: "30000000-0000-4000-8000-000000000001", round_id: R[1], idx: 1, variant: "A", title: "Цикл", correct: "b",
    statement: "Код не шығарады?\n```python\ns = 0\nfor i in range(1, 4):\n    s += i\nprint(s)\n```", options: opts(["3", "6", "10", "Қате шығады"]) },
  { ...base, id: "30000000-0000-4000-8000-000000000002", round_id: R[1], idx: 1, variant: "B", title: "Цикл", correct: "c",
    statement: "Код не шығарады?\n```python\ns = 1\nfor i in range(1, 4):\n    s *= i\nprint(s)\n```", options: opts(["1", "4", "6", "24"]) },
  { ...base, id: "30000000-0000-4000-8000-000000000003", round_id: R[1], idx: 2, title: "Тізім кесіндісі", correct: "a",
    statement: "Код не шығарады?\n```python\na = [5, 3, 8, 1]\nprint(a[1:3])\n```", options: opts(["[3, 8]", "[5, 3]", "[3, 8, 1]", "[8, 1]"]) },
  { ...base, id: "30000000-0000-4000-8000-000000000011", round_id: R[2], idx: 11, title: "Қосынды", points: 3, entry: "total", max_changed_lines: 1,
    statement: "Функция тізімдегі сандардың қосындысын қайтаруы керек. Бір жолды түзет.",
    starter_code: "def total(a):\n    s = 0\n    for x in a:\n        s += x\n    return s + 1\n",
    tests_public: [{ args: [[1, 2]], expected: "3" }, { args: [[]], expected: "0" }],
    tests_hidden: [{ args: [[1]], expected: "1" }, { args: [[5, 5]], expected: "10" }, { args: [[-2, 2]], expected: "0" }] },
  { ...base, id: "30000000-0000-4000-8000-000000000012", round_id: R[2], idx: 12, title: "Ең үлкені", points: 3, entry: "biggest", max_changed_lines: 1,
    statement: "Тізімдегі ең үлкен санды қайтар.",
    starter_code: "def biggest(a):\n    m = 0\n    for x in a:\n        if x > m:\n            m = x\n    return m\n",
    tests_public: [{ args: [[1, 7, 3]], expected: "7" }],
    tests_hidden: [{ args: [[-5, -2, -9]], expected: "-2" }, { args: [[4]], expected: "4" }] },
  { ...base, id: "30000000-0000-4000-8000-000000000015", round_id: R[3], idx: 15, title: "Бірегейлер", points: 4, entry: "uniq", forbidden: ["set("],
    statement: "Тізімдегі әртүрлі элементтер санын қайтар. set() қолдануға болмайды.",
    starter_code: "def uniq(a):\n    # кодыңды осында жаз\n    pass\n",
    tests_public: [{ args: [[1, 1, 2]], expected: "2" }],
    tests_hidden: [{ args: [["a", "b", "a"]], expected: "2" }, { args: [[]], expected: "0" }, { args: [[3, 3, 3]], expected: "1" }] },
];

await fetch(MOCK + "/__seed", {
  method: "POST",
  body: JSON.stringify({
    students: [{ id: SID, auth_user_id: UID, email: "s1@mock.test", last_name: "Серіков", first_name: "Айдос", full_name: "Серіков Айдос", university: "Мок университеті", course: "2 курс", phone: "+77010000001" }],
    contests: [{ id: C, slug: "ui", title: "DEBUG · Репетиция", starts_at: iso(-120_000), status: "running", board_locked: false, board_autolock_min: 10 }],
    rounds: [round(1, "mcq", "Trace — кодты оқу", 20), round(2, "debug", "Debug — қатені түзет", 30), round(3, "code", "Build — өзің жаз", 20)],
    tasks, submissions: [], round_extensions: [], contest_variants: [],
  }),
});
console.log("debug_session=" + signSession(SID, UID));

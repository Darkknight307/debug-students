// «ЖИ талдауы» бетін браузерде тексеруге арналған ойдан шығарылған жарыс (мок дерекқорға).
// node tests/contest/seed-ai.mjs   →  http://localhost:3101/admin/c/<id>/ai
const MOCK = "http://127.0.0.1:4466";
const C = "10000000-0000-4000-8000-0000000000a1";
const R = { 1: "20000000-0000-4000-8000-0000000000a1", 2: "20000000-0000-4000-8000-0000000000a2", 3: "20000000-0000-4000-8000-0000000000a3" };
const T0 = Date.parse("2026-10-10T10:40:00Z"); // Build басталған сәт
const at = (sec) => new Date(T0 + sec * 1000).toISOString();
const sid = (n) => `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tid = (n) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const STARTER = (fn, arg) => `def ${fn}(${arg}):\n    # осында жаз\n    pass\n`;
const base = { statement: "", options: null, correct: null, solution_code: null, max_changed_lines: null, forbidden: [], variant: null, image_url: null, tests_public: [], tests_hidden: [], ai_refs: [] };
const CANON16 = `def eng_uzyn_ospeli(a):\n    if not a:\n        return 0\n    max_len = 1\n    current_len = 1\n    for i in range(1, len(a)):\n        if a[i] > a[i - 1]:\n            current_len += 1\n            if current_len > max_len:\n                max_len = current_len\n        else:\n            current_len = 1\n    return max_len\n`;
const tasks = [
  ...Array.from({ length: 10 }, (_, i) => ({ ...base, id: tid(i + 1), round_id: R[1], idx: i + 1, title: "Trace " + (i + 1), points: 1, starter_code: null, entry: null })),
  ...[11, 12, 13, 14].map((i) => ({ ...base, id: tid(i), round_id: R[2], idx: i, title: "Debug " + i, points: 3, starter_code: "def f(a):\n    return a\n", entry: "f", max_changed_lines: 1 })),
  { ...base, id: tid(15), round_id: R[3], idx: 15, title: "Жолды сығу", points: 4, starter_code: STARTER("sygu", "s"), entry: "sygu" },
  { ...base, id: tid(16), round_id: R[3], idx: 16, title: "Ең ұзын өспелі бөлік", points: 4, starter_code: STARTER("eng_uzyn_ospeli", "a"), entry: "eng_uzyn_ospeli", ai_refs: [CANON16] },
];

const S15 = {
  cur: `def sygu(s):\n    if not s:\n        return ""\n    natije = ""\n    tangba = s[0]\n    sany = 1\n    for i in range(1, len(s)):\n        if s[i] == tangba:\n            sany += 1\n        else:\n            natije += tangba + str(sany)\n            tangba = s[i]\n            sany = 1\n    natije += tangba + str(sany)\n    return natije\n`,
  prev: (r, c) => `def sygu(s):\n    if not s:\n        return ""\n    ${r} = ""\n    ${c} = 1\n    for i in range(1, len(s)):\n        if s[i] == s[i - 1]:\n            ${c} += 1\n        else:\n            ${r} += s[i - 1] + str(${c})\n            ${c} = 1\n    ${r} += s[-1] + str(${c})\n    return ${r}\n`,
  whil: `def sygu(s):\n    result = []\n    i = 0\n    while i < len(s):\n        char = s[i]\n        count = 0\n        while i < len(s) and s[i] == char:\n            count += 1\n            i += 1\n        result.append(char + str(count))\n    return "".join(result)\n`,
  dict: `def sygu(s):\n    d = {}\n    order = []\n    for ch in s:\n        if ch not in d:\n            d[ch] = 0\n            order.append(ch)\n        d[ch] += 1\n    return "".join(ch + str(d[ch]) for ch in order)\n`,
  wrong: `def sygu(s):\n    res = ""\n    c = 1\n    for i in range(1, len(s)):\n        if s[i] == s[i - 1]:\n            c += 1\n        else:\n            res += s[i - 1] + str(c)\n            c = 1\n    return res\n`,
};
const S16 = {
  inIf: (m, c) => CANON16.replace(/max_len/g, m).replace(/current_len/g, c),
  after: (m, c) => `def eng_uzyn_ospeli(a):\n    if not a:\n        return 0\n    ${m} = 1\n    ${c} = 1\n    for i in range(1, len(a)):\n        if a[i] > a[i - 1]:\n            ${c} += 1\n        else:\n            ${c} = 1\n        if ${c} > ${m}:\n            ${m} = ${c}\n    return ${m}\n`,
  whil: `def eng_uzyn_ospeli(a):\n    best = 0\n    i = 0\n    while i < len(a):\n        j = i + 1\n        while j < len(a) and a[j] > a[j - 1]:\n            j += 1\n        if j - i > best:\n            best = j - i\n        i = j\n    return best\n`,
};

// [аты, Trace дұрыс саны, Debug дұрыс саны, Build әрекеттері [[тапсырма, секунд, код, дұрыс]], бақылау дерегі]
const act = (o) => ({ hidden_count: 0, hidden_ms: 0, blur_count: 0, blur_ms: 0, tasks: {}, ...o });
const typed = (keys, dels, pauses, think, extra = {}) => ({ keys, dels, blocked: 0, checks: 2, check_fails: 1, pauses, active_ms: keys * 400, think_ms: think, ...extra });
const people = [
  ["Сейітов Алмас", 10, 4, [[15, 480, S15.cur, 1], [16, 616, CANON16.replace("    if not a:", "    # осында жаз\n    if not a:"), 1]], null],
  ["Жұмабек Дана", 10, 4, [[15, 520, S15.prev("res", "c"), 1], [16, 880, S16.inIf("ML", "CL"), 1]], null],
  ["Оразов Тимур", 9, 4, [[15, 500, S15.prev("res", "sanau"), 1], [16, 1040, S16.inIf("m", "c"), 1]], null],
  ["Әбен Мадина", 10, 4, [[15, 430, S15.prev("out", "k").replace("res +=", "out +="), 1], [16, 760, S16.after("max_len", "cur"), 1]], act({ tasks: { [tid(15)]: typed(260, 70, 4, 60000), [tid(16)]: typed(240, 55, 3, 45000) } })],
  ["Қасым Ерлан", 8, 3, [[15, 380, S15.wrong, 0], [15, 560, S15.prev("res", "c"), 1], [16, 990, S16.after("best", "run"), 1]], act({ hidden_count: 1, hidden_ms: 8000, tasks: { [tid(15)]: typed(310, 120, 6, 90000), [tid(16)]: typed(230, 60, 2, 50000) } })],
  ["Бекен Аян", 3, 1, [[15, 300, S15.dict, 1], [16, 420, S16.whil, 1]], act({ hidden_count: 11, hidden_ms: 240000, blur_count: 14, blur_ms: 260000, tasks: { [tid(15)]: typed(210, 2, 0, 6000, { blocked: 4, checks: 0, check_fails: 0 }), [tid(16)]: typed(190, 1, 0, 4000, { checks: 0, check_fails: 0 }) } })],
  ["Тұрсын Айгерім", 10, 4, [[15, 28, S15.whil, 1], [16, 700, S16.whil.replace(/best/g, "longest"), 1]], null],
  ["Мұрат Нұрлан", 7, 2, [[15, 900, S15.cur.replace(/natije/g, "r").replace(/tangba/g, "t").replace(/sany/g, "n"), 1], [16, 1100, "def eng_uzyn_ospeli(a):\n    return len(a)\n", 0]], null],
  ["Серік Аружан", 6, 2, [[15, 1000, S15.wrong, 0]], null],
  ["Қайрат Бекзат", 9, 4, [[15, 640, S15.prev("res", "c"), 1], [16, 1150, S16.inIf("ML", "CL").replace("if not a:", "if not a:  # тексеру"), 1]], null],
  ["Ілияс Самал", 5, 1, [], null],
];

const students = [], submissions = [], activity = [];
let n = 0;
people.forEach(([name, tr, db, build, a], i) => {
  const s = sid(i + 1);
  students.push({ id: s, auth_user_id: s, email: `s${i}@mock.test`, full_name: name, university: "Мок университеті", course: "2 курс" });
  const add = (task, sec, code, ok, pts) => submissions.push({ id: ++n, contest_id: C, round_id: tasks.find((t) => t.id === task).round_id, task_id: task, student_id: s, answer: code ? null : "a", code, is_correct: !!ok, points: ok ? pts : 0, reason: null, created_at: at(sec) });
  for (let k = 1; k <= 10; k++) add(tid(k), -2400 + k * 60 + i, null, k <= tr, 1);
  [11, 12, 13, 14].forEach((k, j) => add(tid(k), -1200 + (j + 1) * 200 + i * 3, "def f(a):\n    return a\n", j < db, 3));
  for (const [k, sec, code, ok] of build) add(tid(k), sec, code, ok, 4);
  if (a) activity.push({ round_id: R[3], student_id: s, contest_id: C, data: a, updated_at: at(1200) });
});

const res = await fetch(MOCK + "/__seed", {
  method: "POST",
  body: JSON.stringify({
    contests: [{ id: C, slug: "ai-demo", title: "DEBUG · талдау сынағы", starts_at: at(-2400), status: "finished", board_locked: false, board_autolock_min: 10 }],
    rounds: [
      { id: R[1], contest_id: C, idx: 1, kind: "mcq", title: "Trace", duration_min: 20, status: "closed", started_at: at(-2400), ends_at: at(-1200) },
      { id: R[2], contest_id: C, idx: 2, kind: "debug", title: "Debug", duration_min: 20, status: "closed", started_at: at(-1200), ends_at: at(0) },
      { id: R[3], contest_id: C, idx: 3, kind: "code", title: "Build", duration_min: 20, status: "closed", started_at: at(0), ends_at: at(1200) },
    ],
    tasks, students, submissions, activity, contest_variants: [], round_extensions: [],
  }),
});
console.log(await res.text(), "| оқушы:", students.length, "жіберілім:", submissions.length, "→ /admin/c/" + C + "/ai");

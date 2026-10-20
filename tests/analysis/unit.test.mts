// ЖИ талдауының тесттері. Іске қосу: node --test tests/analysis/unit.test.mts
// Деректер ойдан шығарылған; жағдайлар нақты жарыста кездескен үлгілерді қайталайды.
import assert from "node:assert/strict";
import { test } from "node:test";
import { detectFeatures, distinctiveNames, exactTokens, similarity, structureTokens, tokenize, typedChars } from "../../lib/analysis/pycode.ts";
import { analyze, type SubLite } from "../../lib/analysis/analyze.ts";

const S = (c: string) => structureTokens(tokenize(c).tokens).join(" ");
const E = (c: string) => exactTokens(tokenize(c).tokens).join(" ");
const F = (c: string) => detectFeatures(tokenize(c).tokens).sort();

const LONG_A = `def f(a):
    # осында жаз
    if not a:
        return 0

    max_len = 1
    current_len = 1
    for i in range(1, len(a)):
        if a[i] > a[i - 1]:
            current_len += 1
            if current_len > max_len:
                max_len = current_len
        else:
            current_len = 1
    return max_len
`;
const LONG_B = `def f(a):
    if not a :
        return 0
    ML = 1
    CL = 1
    for i in range(1, len(a)):
        if a[i] > a[i-1]:
            CL += 1
            if CL > ML:
                ML = CL
        else:
            CL = 1
    return ML`;
// Сол таңбалар, бірақ «if» блогы басқа деңгейде — мағынасы өзгеше
const LONG_NEST = `def f(a):
    if not a:
        return 0
    m = 1
    c = 1
    for i in range(1, len(a)):
        if a[i] > a[i-1]:
            c += 1
        if c > m:
            m = c
        else:
            c = 1
    return m`;

test("құрылым: атаулар, бос орын және түсініктеме өзгерсе де кілт бірдей", () => {
  assert.equal(S(LONG_A), S(LONG_B));
  assert.notEqual(E(LONG_A), E(LONG_B), "дәл кілт атауларды ажыратады");
  assert.equal(E(LONG_A), E(LONG_A.replace("# осында жаз", "# менің шешімім").replace(/ {4}max_len = 1/, "    max_len  =  1")));
});

test("құрылым: шегініс (блок деңгейі) өзгерсе — басқа код", () => {
  assert.notEqual(S(LONG_B), S(LONG_NEST));
  assert.ok(similarity(S(LONG_B).split(" "), S(LONG_NEST).split(" ")) > 0.85);
});

test("құрылым: кіріктірілген атаулар мен әдістер айнымалы емес", () => {
  assert.notEqual(S("def f(a):\n    return len(a)\n"), S("def f(a):\n    return max(a)\n"));
  assert.notEqual(S("def f(a):\n    a.append(1)\n"), S("def f(a):\n    a.remove(1)\n"));
  assert.equal(S("def f(a):\n    x = len(a)\n    return x\n"), S("def f(b):\n    n = len(b)\n    return n\n"));
});

test("ұқсастық: бірдей = 1, мүлде басқа алгоритм — төмен", () => {
  const a = S(LONG_A).split(" ");
  assert.equal(similarity(a, a), 1);
  const other = S("def f(a):\n    best = 0\n    i = 0\n    while i < len(a):\n        j = i + 1\n        while j < len(a) and a[j] > a[j - 1]:\n            j += 1\n        best = max(best, j - i)\n        i = j\n    return best\n").split(" ");
  assert.ok(similarity(a, other) < 0.75);
});

test("құрылымдар: сөздік/жиын анықталады, f-string жақшасы сөздік деп саналмайды", () => {
  assert.ok(F('def f(s):\n    d = {}\n    for c in s:\n        d[c] = d.get(c, 0) + 1\n    return d\n').includes("dictset"));
  assert.ok(F("def f(a):\n    return len(set(a))\n").includes("dictset"));
  assert.ok(F('def f(s):\n    p = {")": "("}\n    return p\n').includes("dictset"));
  const fs = F('def f(s, c):\n    return f"{s[-1]}{c}"\n');
  assert.ok(!fs.includes("dictset"), "f-string ішіндегі {} сөздік емес");
  assert.ok(fs.includes("helpers"));
  assert.ok(F("def f(s):\n    return s[-1]\n").includes("idioms"));
});

test("құрылымдар: if not, join, comprehension, үштік, lambda, рекурсия, docstring", () => {
  assert.ok(F("def f(s):\n    if not s:\n        return 0\n").includes("idioms"));
  assert.ok(F('def f(a):\n    return "".join(a)\n').includes("helpers"));
  assert.ok(F("def f(a):\n    return [x * 2 for x in a]\n").includes("compact"));
  assert.ok(F("def f(a):\n    return 1 if a else 0\n").includes("compact"));
  assert.ok(F("def f(a):\n    g = lambda x: x\n    return g(a)\n").includes("compact"));
  assert.ok(F("def f(n):\n    if n < 2:\n        return 1\n    return n * f(n - 1)\n").includes("recursion"));
  assert.ok(F('def f(a: list) -> int:\n    """Қысқаша сипаттама."""\n    return 0\n').includes("aiextras"));
  assert.deepEqual(F("def f(a):\n    s = 0\n    for x in a:\n        if x > 0:\n            s += x\n        else:\n            s -= x\n    return s\n"), []);
  assert.ok(F("def f(s):\n    return s[1:]\n").includes("idioms"));
});

test("typedChars: шегініс пен шаблон жолдары есептелмейді", () => {
  const starter = "def f(a):\n    # осында жаз\n    pass\n";
  assert.equal(typedChars("def f(a):\n    # осында жаз\n    return 0\n", starter), "return 0".length + 1);
});

/* ---------------- analyze ---------------- */

const T0 = Date.parse("2026-10-10T10:40:00Z");
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const rounds = [
  { id: "r1", idx: 1, kind: "mcq" as const, started_at: at(-2400), ends_at: at(-1200) },
  { id: "r2", idx: 2, kind: "debug" as const, started_at: at(-1200), ends_at: at(0) },
  { id: "r3", idx: 3, kind: "code" as const, started_at: at(0), ends_at: at(1200) },
];
const STARTER = "def f(a):\n    # осында жаз\n    pass\n";
const tasks = [
  { id: "t1", round_id: "r1", idx: 1, title: "Trace", points: 10, starter_code: null },
  { id: "t11", round_id: "r2", idx: 11, title: "Debug", points: 12, starter_code: null },
  { id: "t16", round_id: "r3", idx: 16, title: "Build", points: 4, starter_code: STARTER },
];
let seq = 0;
const sub = (sid: string, task: string, sec: number, code: string | null, ok = true, points = 4): SubLite =>
  ({ id: ++seq, student_id: sid, task_id: task, code, is_correct: ok, points: ok ? points : 0, created_at: at(sec) });
const students = (ids: string[]) => ids.map((id) => ({ id, full_name: "Оқушы " + id.toUpperCase() }));
// Әр оқушыға бөлек (бір-біріне ұқсамайтын) шешім: тұрақтысы әртүрлі цикл саны
const unique = (k: number) => "def f(a):\n" + Array.from({ length: k + 2 }, (_, i) => `    x${i} = ${i} * ${k}`).join("\n") + "\n    return 0\n";
const base = (ids: string[]) => ids.flatMap((id) => [sub(id, "t1", -2000, null, true, 10), sub(id, "t11", -600, "x", true, 12)]);
const run = (ids: string[], subs: SubLite[], extra: object = {}) =>
  analyze({ rounds, tasks, students: students(ids), subs: [...base(ids), ...subs], options: { untaught: ["dictset"] }, ...extra });
const rep = (a: ReturnType<typeof run>, id: string) => a.students.find((s) => s.studentId === id)!;

test("сирек кездесетін бірдей құрылым: бірінші жібергенге аз, кейінгілерге көбірек салмақ", () => {
  const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const a = run(ids, [
    sub("a", "t16", 400, LONG_A), sub("b", "t16", 700, LONG_B), sub("c", "t16", 900, LONG_B.replace(/ML/g, "m").replace(/CL/g, "c")),
    ...ids.slice(3).map((id, k) => sub(id, "t16", 500 + k * 40, unique(k))),
  ]);
  assert.equal(rep(a, "a").tasks[0].structure?.size, 3);
  assert.equal(rep(a, "a").tasks[0].structure?.common, false);
  assert.equal(rep(a, "a").score, 1);
  assert.equal(rep(a, "b").score, 3);
  assert.equal(rep(a, "b").level, "medium");
  assert.match(rep(a, "c").reasons[0].text, /құрылымы .* бірдей, тек атаулары басқа \(3-ші/);
  assert.equal(rep(a, "d").score, 0);
  const cl = a.clusters.filter((c) => c.kind === "structure");
  assert.equal(cl.length, 1);
  assert.deepEqual(cl[0].members.map((m) => m.name), ["Оқушы A", "Оқушы B", "Оқушы C"]);
});

test("көп тараған стандартты шешім күдік тудырмайды", () => {
  const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const a = run(ids, [
    ...ids.slice(0, 6).map((id, k) => sub(id, "t16", 400 + k * 50, LONG_B.replace(/ML/g, "m" + k).replace(/CL/g, "c" + k))),
    ...ids.slice(6).map((id, k) => sub(id, "t16", 500 + k * 40, unique(k))),
  ]);
  assert.equal(rep(a, "b").tasks[0].structure?.common, true);
  assert.equal(rep(a, "b").score, 0.5);
  assert.equal(rep(a, "b").level, "low");
});

test("атауларына дейін бірдей код — ең күшті белгі", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const copy = LONG_B.replace("if not a :", "if not a:   # көшірме") + "\n\n";
  const a = run(ids, [sub("a", "t16", 400, LONG_B), sub("b", "t16", 800, copy), ...ids.slice(2).map((id, k) => sub(id, "t16", 500 + k * 40, unique(k)))]);
  assert.equal(rep(a, "b").tasks[0].exact?.size, 2);
  assert.equal(rep(a, "b").score, 3, "ML/CL — қысқа жалпы атаулар: құрылым сәйкестігімен тең");
  assert.equal(rep(a, "a").score, 1);
  // Ерекше атаулар да сәйкес келсе — ең күшті белгі
  const odd = LONG_B.replace(/ML/g, "en_uzyn_tizbek").replace(/CL/g, "agymdagy_uzyndyq");
  const a2 = run(ids, [sub("a", "t16", 400, odd), sub("b", "t16", 800, odd + "\n# соңы\n"), ...ids.slice(2).map((id, k) => sub(id, "t16", 500 + k * 40, unique(k)))]);
  assert.equal(rep(a2, "b").score, 5);
  assert.equal(rep(a2, "a").score, 2);
  assert.match(rep(a2, "b").reasons[0].text, /ерекше атаулары да сәйкес: en_uzyn_tizbek/);
  assert.equal(a.clusters.filter((c) => c.kind === "exact").length, 1);
  assert.equal(a.clusters.length, 1, "дәл бірдей топ құрылым тобы ретінде екінші рет көрсетілмейді");
});

test("өтілмеген тақырып пен теру жылдамдығы", () => {
  const ids = ["a", "b", "c"];
  const dict = "def f(a):\n    d = {}\n    for x in a:\n        d[x] = 1\n    return len(d)\n";
  const a = run(ids, [sub("a", "t16", 500, dict), sub("b", "t16", 25, LONG_B), sub("c", "t16", 600, unique(1))]);
  assert.match(rep(a, "a").reasons[0].text, /өтілмеген тақырып.*сөздік/);
  assert.equal(rep(a, "a").score, 3);
  const b = rep(a, "b").tasks[0];
  assert.equal(b.seconds, 25);
  assert.ok(b.cpm! >= 240);
  assert.match(rep(a, "b").reasons[0].text, /қолмен теруге тым жылдам/);
  // Сөздік «өтілген» деп белгіленсе — күдік жоқ
  const a2 = analyze({ rounds, tasks, students: students(ids), subs: [...base(ids), sub("a", "t16", 500, dict)], options: { untaught: [] } });
  assert.equal(rep(a2, "a").score, 0);
});

test("уақыт алдыңғы шешілген тапсырмадан бастап есептеледі", () => {
  const tasks2 = [...tasks, { id: "t15", round_id: "r3", idx: 15, title: "Build 15", points: 4, starter_code: STARTER }];
  const a = analyze({ rounds, tasks: tasks2, students: students(["a"]), options: { untaught: [] },
    subs: [...base(["a"]), sub("a", "t15", 480, unique(3)), sub("a", "t16", 616, LONG_A)] });
  const t16 = rep(a, "a").tasks.find((t) => t.idx === 16)!;
  assert.equal(t16.seconds, 136);
  assert.ok(t16.cpm! < 160, `адамға тән жылдамдық: ${t16.cpm}`);
  assert.equal(rep(a, "a").score, 0);
});

test("кезеңдер сәйкессіздігі және қорғайтын белгі (код біртіндеп түзетілген)", () => {
  const ids = ["a", "b"];
  const weak = [sub("a", "t1", -2000, null, false, 10), sub("a", "t11", -600, "x", false, 12)];
  const a = analyze({ rounds, tasks, students: students(ids), options: { untaught: [] },
    subs: [...weak, ...base(["b"]), sub("a", "t16", 600, unique(2)),
      sub("b", "t16", 400, LONG_NEST, false), sub("b", "t16", 700, LONG_B)] });
  assert.match(rep(a, "a").reasons[0].text, /Trace \(0%\) пен Debug \(0%\) нәтижесі төмен/);
  assert.equal(rep(a, "a").score, 2);
  assert.equal(rep(a, "b").tasks[0].evolved, true);
  assert.equal(rep(a, "b").tasks[0].failedBefore, 1);
  assert.match(rep(a, "b").reasons.at(-1)!.text, /біртіндеп түзетіп/);
  assert.equal(rep(a, "b").score, 0);
});

test("бақылау дерегі: беттен шығу, қоюға тырысу, көшіріп теру үлгісі", () => {
  const ids = ["a", "b", "c"];
  const activity = [
    { student_id: "a", round_id: "r3", data: { hidden_count: 9, hidden_ms: 200_000, tasks: { t16: { keys: 190, dels: 2, pauses: 0, blocked: 3, think_ms: 5000 } } } },
    { student_id: "b", round_id: "r3", data: { hidden_count: 0, hidden_ms: 0, tasks: { t16: { keys: 260, dels: 70, pauses: 4, blocked: 0, checks: 3, check_fails: 2, think_ms: 60_000 } } } },
    { student_id: "c", round_id: "r1", data: { hidden_count: 50, hidden_ms: 900_000 } }, // Trace-тегі дерек Build бағасына кірмейді
  ];
  const a = run(ids, ids.map((id, k) => sub(id, "t16", 500 + k * 60, unique(k))), { activity });
  const ra = rep(a, "a");
  assert.equal(ra.level, "high");
  assert.ok(ra.reasons.some((r) => /жарыс бетінен 9 рет шыққан/.test(r.text)));
  assert.ok(ra.reasons.some((r) => /қоюға \(paste\) 3 рет/.test(r.text)));
  assert.ok(ra.reasons.some((r) => /түзетусіз және кідіріссіз/.test(r.text)));
  assert.equal(rep(a, "b").score, 0);
  assert.ok(rep(a, "b").reasons.some((r) => r.weight < 0));
  assert.equal(rep(a, "c").away, null);
  assert.equal(a.overview.hasActivity, true);
});

test("ЖИ үлгі жауабы және Build-ке қатыспағандар", () => {
  const ids = ["a", "b", "c"];
  const tasksAi = tasks.map((t) => (t.id === "t16" ? { ...t, ai_refs: [LONG_A] } : t));
  const a = analyze({ rounds, tasks: tasksAi, students: students(ids), options: { untaught: [] },
    subs: [...base(ids), sub("a", "t16", 500, LONG_A.replace("    # осында жаз\n", "")), sub("b", "t16", 600, LONG_B)] });
  assert.equal(rep(a, "a").tasks[0].aiRef?.exact, true);
  assert.ok(rep(a, "a").reasons.some((r) => /ЖИ үлгі жауабымен атауларына дейін бірдей/.test(r.text)));
  assert.ok(rep(a, "b").reasons.some((r) => /құрылымы ЖИ үлгі жауабымен бірдей/.test(r.text)));
  assert.equal(a.students.some((s) => s.studentId === "c"), false, "Build-ке кірмеген оқушы тізімде жоқ");
  assert.equal(a.overview.participants, 3);
  assert.equal(a.overview.buildParticipants, 2);
});

test("рейтинг лидербордпен бірдей: ұпай, сосын ертерек бітірген", () => {
  const ids = ["a", "b", "c"];
  const a = run(ids, [sub("a", "t16", 900, unique(1)), sub("b", "t16", 300, unique(2)), sub("c", "t16", 500, unique(3), false)]);
  assert.deepEqual([rep(a, "b").rank, rep(a, "a").rank, rep(a, "c").rank], [1, 2, 3]);
  assert.equal(rep(a, "a").total, 26);
  assert.deepEqual(rep(a, "c").byKind.code, { got: 0, max: 4 });
});

test("қысқа стандартты шешімдер арасындағы 90% шамасындағы ұқсастық күдік емес", () => {
  // Екі оқушы бір алгоритмнің екі түрін жазған: максимум әртүрлі жерде жаңарады (~92% ұқсас)
  const afterIf = LONG_B.replace("            if CL > ML:\n                ML = CL\n        else:\n            CL = 1", "        else:\n            CL = 1\n        if CL > ML:\n            ML = CL");
  const ids = ["a", "b", "c", "d", "e"];
  const a = run(ids, [sub("a", "t16", 400, LONG_B), sub("b", "t16", 700, afterIf), ...ids.slice(2).map((id, k) => sub(id, "t16", 500 + k * 40, unique(k)))]);
  const near = rep(a, "b").tasks[0].nearest[0];
  assert.ok(near && near.sim > 0.85 && near.sim < 0.96, "ұқсастық көрсетіледі: " + near?.sim);
  assert.equal(rep(a, "b").score, 0, "бірақ күдікке қосылмайды");
});

test("тым қысқа код: дәл сәйкестік те күдік тудырмайды", () => {
  const ids = ["a", "b", "c"];
  const tiny = "def f(a):\n    return len(a)\n";
  const a = run(ids, [sub("a", "t16", 400, tiny), sub("b", "t16", 700, tiny), sub("c", "t16", 800, unique(3))]);
  assert.equal(rep(a, "a").score, 0);
  assert.equal(rep(a, "b").score, 1);
  assert.match(rep(a, "b").reasons[0].text, /код өте қысқа/);
  assert.equal(a.clusters[0].common, true);
});

test("ерекше атаулар: жалпы атаулар мен шаблондағы параметрлер есептелмейді", () => {
  const D = (c: string) => distinctiveNames(tokenize(c).tokens).sort();
  assert.deepEqual(D("def sygu(soz):\n    res = \"\"\n    count = 1\n    for i in range(len(soz)):\n        res += soz[i]\n    return res\n"), []);
  assert.deepEqual(D("def f(a):\n    natije = 0\n    agymdagy_tangba = a[0]\n    max_len = len(a)\n    return natije\n"), ["agymdagy_tangba", "natije"]);
});

test("ЖИ үлгісімен бірдей құрылым көп оқушыда болса — стандартты шешім", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const tasksAi = tasks.map((t) => (t.id === "t16" ? { ...t, ai_refs: [LONG_A] } : t));
  const subs = [...base(ids), ...ids.slice(0, 5).map((id, k) => sub(id, "t16", 400 + k * 60, LONG_B.replace(/ML/g, "m" + k).replace(/CL/g, "c" + k))), sub("f", "t16", 900, unique(2))];
  const a = analyze({ rounds, tasks: tasksAi, students: students(ids), subs, options: { untaught: [] } });
  const r = rep(a, "c").reasons.find((x) => /ЖИ үлгі/.test(x.text))!;
  assert.equal(r.weight, 0.5);
  assert.match(r.text, /көп тараған стандартты шешім/);
  assert.equal(rep(a, "c").level, "low");
});

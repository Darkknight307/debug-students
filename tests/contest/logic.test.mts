// Ортақ жарыс логикасы (lib/contest/logic.ts): сервер де, mockService да осыны қолданады.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  closeRoundPatch, computeRanking, extendRoundPatch, isBoardLocked, maskEmail, maskPhone, publicName, publicTask,
  roundWindow, startRoundPatches, type ScoredSubmission,
} from "../../lib/contest/logic.ts";
import type { AdminRound, AdminTask } from "../../lib/client/types.ts";

const T0 = Date.parse("2026-10-20T10:00:00Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const round = (id: string, idx: number, kind: AdminRound["kind"], extra: Partial<AdminRound> = {}): AdminRound => ({
  id, contest_id: "c", idx, kind, title: kind, duration_min: 20, status: "pending", started_at: null, ends_at: null, ...extra,
});
let seq = 0;
const sub = (student_id: string, task_id: string, ok: boolean, min: number, extra: Partial<ScoredSubmission> = {}): ScoredSubmission => ({
  id: ++seq, round_id: "r2", task_id, student_id, is_correct: ok, points: ok ? 3 : 0, created_at: at(min), ...extra,
});
const names: Record<string, string> = { a: "Әлиев Арман", b: "Бекова Бота", c: "Серіков Айдос" };

test("рейтинг: әр тапсырманың соңғы жіберілімі есептеледі (T10-1)", () => {
  const rows = computeRanking([sub("a", "t1", true, 1), sub("a", "t1", false, 2), sub("b", "t1", true, 3)], [round("r2", 2, "debug")], (id) => names[id]);
  assert.deepEqual(rows.map((r) => [r.student_id, r.score, r.rank]), [["b", 3, 1], ["a", 0, 2]]);
  assert.equal(rows[0].total, 2);
});

test("рейтинг: ұпай тең болса — соңғы дұрыс жауабы ертерегі жоғары, сосын аты бойынша (T10-2)", () => {
  const rows = computeRanking([sub("a", "t1", true, 5), sub("b", "t1", true, 2)], [round("r2", 2, "debug")], (id) => names[id]);
  assert.deepEqual(rows.map((r) => r.student_id), ["b", "a"]);
  const tie = computeRanking([sub("c", "t1", true, 4), sub("a", "t1", true, 4)], [round("r2", 2, "debug")], (id) => names[id]);
  assert.deepEqual(tie.map((r) => r.student_id), ["a", "c"]); // Әлиев < Серіков
});

test("рейтинг: жүріп жатқан Trace кезеңі есептелмейді, жабылғанда қосылады (T10-3)", () => {
  const subs = [sub("a", "q1", true, 1, { round_id: "r1", points: 1 }), sub("b", "t1", true, 2)];
  const running = computeRanking(subs, [round("r1", 1, "mcq", { status: "running" }), round("r2", 2, "debug")], (id) => names[id]);
  assert.deepEqual(running.map((r) => r.student_id), ["b"]);
  const closed = computeRanking(subs, [round("r1", 1, "mcq", { status: "closed" }), round("r2", 2, "debug")], (id) => names[id]);
  assert.deepEqual(closed.map((r) => r.student_id).sort(), ["a", "b"]);
});

test("кезең терезесі: жеке +5 мин есепке алынады (T10-4)", () => {
  const r = round("r1", 1, "mcq", { status: "running", started_at: at(0), ends_at: at(20) });
  assert.equal(roundWindow(r, 0, T0 + 22 * 60_000).state, "closed");
  const w = roundWindow(r, 5, T0 + 22 * 60_000);
  assert.equal(w.state, "open");
  assert.equal(w.endsAt, T0 + 25 * 60_000);
  assert.equal(roundWindow(round("x", 1, "mcq"), 0, T0).state, "pending");
});

test("лидерборд құлпы: соңғы 10 минутта және қолмен (T10-5)", () => {
  const rounds = [round("r1", 1, "mcq", { status: "closed", started_at: at(0), ends_at: at(20) }), round("r3", 3, "code", { status: "running", started_at: at(30), ends_at: at(50) })];
  const c = { board_locked: false, board_autolock_min: 10 };
  assert.equal(isBoardLocked(c, rounds, T0 + 41 * 60_000), true);
  assert.equal(isBoardLocked(c, rounds, T0 + 39 * 60_000), false);
  assert.equal(isBoardLocked(c, rounds, T0 + 51 * 60_000), false);
  assert.equal(isBoardLocked({ ...c, board_locked: true }, rounds, T0), true);
});

test("publicTask жауап кілттерін шығармайды (T10-6)", () => {
  const t: AdminTask = {
    id: "t", round_id: "r", idx: 1, title: "x", statement: "s", points: 3, options: [{ key: "a", text: "1" }], correct: "a",
    starter_code: "def f(): pass", solution_code: "SECRET", variant: null, image_url: null, entry: "f", max_changed_lines: 1,
    forbidden: [], ai_refs: ["AI"], tests_public: [{ args: [1], expected: "1" }], tests_hidden: [{ args: [2], expected: "2" }],
  };
  for (const kind of ["mcq", "debug", "code"] as const) {
    const json = JSON.stringify(publicTask(t, kind));
    for (const k of ["correct", "solution_code", "tests_hidden", "ai_refs", "SECRET"]) assert.ok(!json.includes(k), `${kind}: ${k}`);
  }
});

test("кезеңді бастау басқа жүріп тұрған кезеңді жабады; ұзарту мен аяқтау тек жүріп тұрғанда", () => {
  const rounds = [round("r1", 1, "mcq", { status: "running", started_at: at(0), ends_at: at(20) }), round("r2", 2, "debug", { duration_min: 30 })];
  const p = startRoundPatches(rounds, "r2", T0 + 10 * 60_000)!;
  assert.deepEqual(p[0], { id: "r1", patch: { status: "closed", ends_at: at(10) } });
  assert.deepEqual(p[1], { id: "r2", patch: { status: "running", started_at: at(10), ends_at: at(40) } });
  assert.equal(startRoundPatches(rounds, "nope", T0), null);
  assert.deepEqual(extendRoundPatch(rounds[0], 5, T0 + 25 * 60_000), { ends_at: at(30) }); // уақыт өтсе — қазірден бастап
  assert.equal(extendRoundPatch(rounds[1], 5, T0), null);
  assert.deepEqual(closeRoundPatch(rounds[0], T0 + 5 * 60_000), { status: "closed", ends_at: at(5) });
  assert.equal(closeRoundPatch(rounds[1], T0), null);
});

test("жария аты мен жасырылған email/телефон", () => {
  assert.equal(publicName("  Серіков   Айдос Қайратұлы "), "Серіков Айдос");
  assert.equal(publicName(""), "Аты көрсетілмеген");
  assert.equal(maskEmail("aidos.serikov@mock.test"), "ai•••@mock.test");
  assert.equal(maskPhone("+77010000001"), "••• ••• 00 01");
  assert.equal(maskPhone(null), "—");
});

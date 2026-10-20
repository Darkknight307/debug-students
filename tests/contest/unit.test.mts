// Іске қосу: node --test tests/contest/unit.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";
import { changedLines, checkCode, compareOutputs, normalizeAnswer } from "../../lib/contest/rules.ts";
import { pickIndices, signChallenge, verifyChallenge } from "../../lib/contest/challenge.ts";

process.env.SESSION_SECRET = "unit-test-secret-unit-test-secret-000";

const QOSYNDY = `def qosyndy(a, b):
    s = 0
    for i in range(a, b):
        s = s + i
    return s
`;

test("normalizeAnswer: Apps Script-тегідей салыстырады", () => {
  assert.equal(normalizeAnswer("[True, False]"), normalizeAnswer("[true,false]"));
  assert.equal(normalizeAnswer("['a', 'b']"), normalizeAnswer('["a","b"]'));
  assert.equal(normalizeAnswer(" [[3], 2] "), "[[3],2]");
  assert.notEqual(normalizeAnswer("[1, 2]"), normalizeAnswer("[2, 1]"));
});

test("changedLines: қыркүйектегі 11-тапсырманың дұрыс түзетуі — 1 жол", () => {
  assert.equal(changedLines(QOSYNDY, QOSYNDY.replace("range(a, b)", "range(a, b + 1)")), 1);
});

test("changedLines: қосу, өшіру, екі бөлек түзету", () => {
  const withLine = QOSYNDY.replace("    return s", "    s = s + 0\n    return s");
  assert.equal(changedLines(QOSYNDY, withLine), 1, "бір жол қосу");
  assert.equal(changedLines(QOSYNDY, QOSYNDY.replace("    s = 0\n", "")), 1, "бір жол өшіру");
  const two = QOSYNDY.replace("range(a, b)", "range(a, b + 1)").replace("s = 0", "s = 1");
  assert.equal(changedLines(QOSYNDY, two), 2, "екі бөлек өзгеріс");
});

test("changedLines: бос жолдар мен соңғы бос орындар есептелмейді, шегініс есептеледі", () => {
  assert.equal(changedLines(QOSYNDY, QOSYNDY.replace("    s = 0\n", "    s = 0   \n\n\n")), 0);
  assert.equal(changedLines(QOSYNDY, QOSYNDY.replace("        s = s + i", "    s = s + i")), 1);
});

test("checkCode: Debug-та 2 жол өзгерсе — бұғатталады", () => {
  const task = { kind: "debug" as const, starter_code: QOSYNDY, max_changed_lines: 1, forbidden: [] };
  const ok = checkCode(task, QOSYNDY.replace("range(a, b)", "range(a, b + 1)"));
  assert.equal(ok.ok, true);
  const bad = checkCode(task, QOSYNDY.replace("range(a, b)", "range(a, b + 1)").replace("s = 0", "s = 1"));
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.reason, "lines");
    assert.equal(bad.changed, 2);
  }
});

test("checkCode: Build-те set( тыйым салынған, бос код қабылданбайды", () => {
  const task = { kind: "code" as const, starter_code: null, max_changed_lines: null, forbidden: ["set("] };
  const bad = checkCode(task, "def f(nums):\n    return list(set(nums))\n");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.reason, "forbidden");
  assert.equal(checkCode(task, "   \n").ok, false);
  assert.equal(checkCode(task, "def f(nums):\n    out = []\n    return out\n").ok, true);
});

test("compareOutputs: әр тест бойынша, ұзындығы сәйкес болуы керек", () => {
  assert.equal(compareOutputs(["9", "30", "7"], ["9", "30", "7"]), true);
  assert.equal(compareOutputs(["[3, 1, 2]"], ["[3,1,2]"]), true);
  assert.equal(compareOutputs(["9", "30"], ["9", "30", "7"]), false);
  assert.equal(compareOutputs(["!ERR NameError: x"], ["5"]), false);
  assert.equal(compareOutputs("9", ["9"]), false);
});

test("челлендж: қолтаңба, бұрмалау, мерзім", () => {
  const now = Date.now();
  const t = signChallenge("s1", "t1", [0, 2], now);
  const c = verifyChallenge(t, now);
  assert.ok(c);
  assert.deepEqual(c.idx, [0, 2]);
  const mac = t.split(".")[1];
  const forged = Buffer.from(JSON.stringify({ sid: "s1", tid: "t1", idx: [0, 1, 2], exp: 9e9 })).toString("base64url");
  assert.equal(verifyChallenge(`${forged}.${mac}`, now), null);
  assert.equal(verifyChallenge(t, now + 181_000), null);
  assert.equal(verifyChallenge(null), null);
});

test("pickIndices: қайталанбайды, шектен аспайды, реттелген", () => {
  const p = pickIndices(60, 10);
  assert.equal(p.length, 10);
  assert.equal(new Set(p).size, 10);
  assert.ok(p.every((x, k) => x >= 0 && x < 60 && (k === 0 || p[k - 1] < x)));
  assert.deepEqual(pickIndices(3, 10), [0, 1, 2]);
});

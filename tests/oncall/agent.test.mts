// On-call агенті (#91): Gemini function-calling циклі, құралдар, incident issue логикасы, alert relay Lambda-сы.
// Нағыз Gemini/AWS/GitHub шақырылмайды — бәрі жалған (fake) клиенттермен.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { investigate, type Alarm } from "../../ops/oncall/agent.ts";
import { geminiClient, type GenerateRequest, type GenerateResponse } from "../../ops/oncall/gemini.ts";
import { buildTools, clip, type Tool } from "../../ops/oncall/tools.ts";
import { respond, type Issues } from "../../ops/oncall/github.ts";

const alarm: Alarm = { name: "debug-prod-5xx", state: "ALARM", reason: "Threshold Crossed: 1 datapoint [7.0] >= 5", time: "2026-11-17T10:00:00Z", description: "5xx" };
const model = (parts: unknown[]): GenerateResponse => ({ candidates: [{ content: { role: "model", parts: parts as never } }] });
const fakeTool = (out: unknown, seen: unknown[] = []): Tool => ({ declaration: { name: "x", description: "x" }, run: async (a) => (seen.push(a), out) });

test("цикл: Gemini құралды шақырады → нәтиже functionResponse ретінде қайтады (thoughtSignature сақталады) → есеп", async () => {
  const sent: GenerateRequest[] = [];
  const seen: unknown[] = [];
  const replies = [
    model([{ functionCall: { id: "c1", name: "metric_series", args: { metric: "http_5xx" } }, thoughtSignature: "sig-1" }]),
    model([{ text: "thinking", thought: true }, { text: "## Summary\nSeven 5xx after deploy abc." }]),
  ];
  const r = await investigate({ alarm, generate: async (req) => (sent.push(structuredClone(req)), replies.shift()!), tools: { metric_series: fakeTool({ points: [["t", 7]] }, seen) } });
  assert.equal(r.report, "## Summary\nSeven 5xx after deploy abc.");
  assert.deepEqual(seen, [{ metric: "http_5xx" }]);
  assert.deepEqual(r.calls, [{ name: "metric_series", args: { metric: "http_5xx" }, ok: true }]);
  const second = sent[1].contents;
  assert.deepEqual(second[1], { role: "model", parts: [{ functionCall: { id: "c1", name: "metric_series", args: { metric: "http_5xx" } }, thoughtSignature: "sig-1" }] });
  assert.deepEqual(second[2].parts[0].functionResponse, { id: "c1", name: "metric_series", response: { result: '{"points":[["t",7]]}' } });
  assert.match(sent[0].contents[0].parts[0].text!, /debug-prod-5xx/);
  assert.ok(sent[0].tools![0].functionDeclarations.length === 1 && sent[0].systemInstruction);
});

test("шақыру шегі: maxCalls біткенде құралдар өшіріледі (mode NONE) және есеп жазылады", async () => {
  const sent: GenerateRequest[] = [];
  const call = model([{ functionCall: { name: "metric_series", args: {} } }]);
  const replies = [call, call, model([{ text: "final" }])];
  const r = await investigate({ alarm, maxCalls: 2, generate: async (req) => (sent.push(req), replies.shift()!), tools: { metric_series: fakeTool(1) } });
  assert.equal(r.report, "final");
  assert.equal(r.calls.length, 2);
  assert.equal(sent[2].toolConfig?.functionCallingConfig.mode, "NONE");
});

test("құрал қатесі және белгісіз құрал — error жауабы, цикл жалғасады", async () => {
  const sent: GenerateRequest[] = [];
  const replies = [model([{ functionCall: { name: "metric_series" } }, { functionCall: { name: "rm_rf" } }]), model([{ text: "done" }])];
  const broken: Tool = { declaration: { name: "metric_series", description: "" }, run: async () => { throw new Error("AccessDenied"); } };
  const r = await investigate({ alarm, generate: async (req) => (sent.push(req), replies.shift()!), tools: { metric_series: broken } });
  assert.equal(r.report, "done");
  assert.deepEqual(r.calls.map((c) => c.ok), [false, false]);
  const resp = sent[1].contents[2].parts.map((p) => p.functionResponse!.response);
  assert.deepEqual(resp, [{ error: "AccessDenied" }, { error: "unknown tool rm_rf" }]);
});

test("Gemini-ге жеке дерек кетпейді: email, телефон, аты-жөні мәндері жасырылады", () => {
  const s = clip({ event: "x", email: "s1@mock.test", phone: "+77010000001", full_name: "Серіков Айдос", status: 500 });
  assert.doesNotMatch(s, /mock\.test|7701|Серіков/);
  assert.match(s, /"status":500/);
});

test("geminiClient: дұрыс URL мен кілт тақырыбы; 429-да қайталайды; 400-де қате", async () => {
  const seen: { url: string; key: string | null }[] = [];
  const statuses = [429, 200];
  const fake = (async (url: string, init: RequestInit) => {
    seen.push({ url, key: new Headers(init.headers).get("x-goog-api-key") });
    const st = statuses.shift()!;
    return new Response(st === 200 ? JSON.stringify(model([{ text: "ok" }])) : "busy", { status: st });
  }) as unknown as typeof fetch;
  const gen = geminiClient("k-123", "gemini-flash-latest", fake, async () => {});
  const r = await gen({ contents: [] });
  assert.equal(r.candidates?.[0].content?.parts[0].text, "ok");
  assert.deepEqual(seen.map((s) => s.url), Array(2).fill("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent"));
  assert.equal(seen[0].key, "k-123");
  const bad = geminiClient("k", "m", (async () => new Response("nope", { status: 400 })) as unknown as typeof fetch, async () => {});
  await assert.rejects(bad({ contents: [] }), /Gemini HTTP 400/);
});

test("құралдар тек оқиды: metric_series дұрыс CloudWatch сұрауы, шектер қысылады; alarm атауы тазартылады", async () => {
  const calls: string[][] = [];
  const exec = async (cmd: string, args: string[]) => {
    calls.push([cmd, ...args]);
    if (args[1] === "get-metric-data") return JSON.stringify({ MetricDataResults: [{ Timestamps: ["t2", "t1"], Values: [3, 1] }] });
    return "{}";
  };
  const tools = buildTools({ region: "eu-central-1", instanceId: "i-1", siteUrl: "https://p", devSiteUrl: "https://d", repo: "o/r" }, exec, fetch, () => Date.parse("2026-11-17T10:00:00Z"));
  const r = (await tools.metric_series.run({ metric: "submissions", env: "development", minutes: 99999 })) as { points: unknown[]; stat: string };
  assert.deepEqual([r.points, r.stat], [[["t1", 1], ["t2", 3]], "Sum"]);
  const q = JSON.parse(calls[0][calls[0].indexOf("--metric-data-queries") + 1]);
  assert.deepEqual(q[0].MetricStat.Metric, { Namespace: "DebugStudents", MetricName: "submissions", Dimensions: [{ Name: "env", Value: "development" }] });
  assert.equal(calls[0][calls[0].indexOf("--start-time") + 1], "2026-11-16T10:00:00.000Z"); // 1440 мин-қа дейін қысылды
  await tools.alarm_details.run({ alarm_name: "debug-prod-5xx; rm -rf /" });
  assert.ok(calls.some((c) => c.includes("debug-prod-5xxrm-rf")));
  for (const c of calls) assert.ok(/^(describe|get|list|start-query)/.test(c[2] ?? c[1]), c.join(" "));
});

function fakeIssues(open: number | null) {
  const log: string[] = [];
  const issues: Issues = {
    findOpen: async () => open,
    create: async (t) => (log.push(`create ${t}`), 42),
    comment: async (n, b) => void log.push(`comment ${n} ${b.split("\n")[0]}`),
    close: async (n) => void log.push(`close ${n}`),
  };
  return { issues, log };
}
const inv = async () => ({ report: "## Summary\nx", footer: "_agent_" });

test("issue: ALARM → жаңа incident; қайта ALARM → түсініктеме; OK → resolved + жабу; басқа күй → ештеңе", async () => {
  let f = fakeIssues(null);
  assert.deepEqual(await respond(alarm, f.issues, inv), { action: "created", issue: 42 });
  assert.deepEqual(f.log, ["create Incident [debug-prod-5xx]: 5xx"]);
  f = fakeIssues(7);
  assert.deepEqual(await respond(alarm, f.issues, inv), { action: "commented", issue: 7 });
  f = fakeIssues(7);
  assert.deepEqual(await respond({ ...alarm, state: "OK" }, f.issues, inv), { action: "closed", issue: 7 });
  assert.deepEqual(f.log, ["comment 7 ✅ **Resolved** — `debug-prod-5xx` returned to OK at 2026-11-17T10:00:00Z.", "close 7"]);
  f = fakeIssues(null);
  assert.deepEqual(await respond({ ...alarm, state: "OK" }, f.issues, inv), { action: "ignored", issue: null });
  assert.deepEqual(await respond({ ...alarm, state: "INSUFFICIENT_DATA" }, f.issues, async () => { throw new Error("must not run"); }), { action: "ignored", issue: null });
  f = fakeIssues(null);
  await respond(alarm, f.issues, inv, true);
  assert.match(f.log[0], /^create \[drill\] Incident \[debug-prod-5xx\]/);
});

test("alert relay Lambda (stack.yml): SNS alarm → GitHub repository_dispatch cloudwatch-alarm, токен SSM-нен", async () => {
  const stack = readFileSync(new URL("../../infra/aws/stack.yml", import.meta.url), "utf8");
  const code = stack.match(/ZipFile: \|\n([\s\S]*?)\n\n/)![1].split("\n").map((l) => l.slice(10)).join("\n");
  const posted: { url: string; auth: string | null; body: any }[] = [];
  const sandbox = {
    exports: {} as Record<string, (e: unknown) => Promise<void>>,
    process: { env: { REPO: "o/r", TOKEN_PARAM: "/debug-students/github-dispatch-token" } },
    console: { log() {} },
    JSON, String,
    require: () => ({
      SSMClient: class { send = async (c: { input: { Name: string } }) => ({ Parameter: { Value: c.input.Name === "/debug-students/github-dispatch-token" ? "ghp_test" : "" } }); },
      GetParameterCommand: class { constructor(public input: unknown) {} },
    }),
    fetch: async (url: string, init: RequestInit) => (posted.push({ url, auth: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) }), new Response(null, { status: 204 })),
  };
  vm.runInNewContext(code, sandbox);
  const msg = { AlarmName: "debug-prod-5xx", NewStateValue: "ALARM", OldStateValue: "OK", NewStateReason: "Threshold Crossed", StateChangeTime: "2026-11-17T10:00:00Z", AlarmDescription: "5xx" };
  await sandbox.exports.handler({ Records: [{ Sns: { Message: JSON.stringify(msg) } }] });
  assert.deepEqual(posted, [{
    url: "https://api.github.com/repos/o/r/dispatches", auth: "Bearer ghp_test",
    body: { event_type: "cloudwatch-alarm", client_payload: { alarm: { name: "debug-prod-5xx", state: "ALARM", oldState: "OK", reason: "Threshold Crossed", time: "2026-11-17T10:00:00Z", description: "5xx" } } },
  }]);
});

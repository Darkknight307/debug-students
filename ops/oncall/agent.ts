import { callsOf, textOf, type Content, type Generate, type Part } from "./gemini";
import { clip, type Tool } from "./tools";

/**
 * On-call агенті (#91): alarm туралы дерек → Gemini өзі таңдаған read-only құралдармен тексереді (≤ maxCalls шақыру)
 * → Markdown инцидент есебі. Агент ештеңені өзгертпейді: тек дерек оқиды және ұсыныс жазады, шешімді адам қабылдайды.
 */
export type Alarm = { name: string; state: string; oldState?: string; reason?: string; time?: string; description?: string };
export type Investigation = { report: string; calls: { name: string; args: Record<string, unknown>; ok: boolean }[]; model?: string };

export const SYSTEM = `You are the on-call SRE for "DEBUG · Студенттер", an online programming contest for university students
(Next.js + PostgreSQL in Docker on one AWS EC2 t3.micro; production https://<ip>.sslip.io and development https://dev.<ip>.sslip.io
on the same server; push to main deploys development, production changes only through the manual "Promote to production" workflow).
A CloudWatch alarm fired. Investigate with the tools — they are read-only — and find out what is happening, how bad it is and why.
Rules:
- Check facts before concluding: look at the alarm, the metric around the alarm time, logs, traces, health and recent deploys as needed.
- Each of your turns costs one request from a small daily quota: call independent tools together in ONE turn
  (parallel function calls — e.g. alarm_details + metric_series + site_health + recent_traces + search_logs + recent_deploys
  at once), then at most one follow-up turn. Aim for 2-3 turns and at most a dozen tool calls; stop as soon as the evidence is clear.
- Never ask for or repeat personal data (names, e-mails, phones, code of students). Never invent numbers: quote what the tools returned.
- You cannot change anything. Recommend actions for the human owner, e.g. "run Promote to production with sha=<previous good sha> and force"
  for a rollback, "restart the app container via Session Manager", or "no action, transient".
Write the final answer in Markdown with exactly these sections:
## Summary (2-3 sentences, what is wrong now)
## Impact (who is affected: production/development, students, admins)
## Evidence (bullet list: metric values with times, log events, trace ids, versions)
## Likely cause
## Recommended action (numbered, safest first)
## Confidence (low/medium/high and why)`;

export function alarmPrompt(alarm: Alarm, drill: boolean): string {
  return [
    drill ? "DRILL: this alarm was triggered on purpose to test the on-call pipeline. Investigate normally and say if the data shows no real problem." : "",
    "Alarm event:",
    "```json",
    JSON.stringify(alarm, null, 2),
    "```",
    "Metrics: namespace DebugStudents, dimension env=production|development: http_latency (ms per request; SampleCount = requests), http_5xx, registrations, submissions (answers + code), login_failures. Server CPU is AWS/EC2.",
  ].filter(Boolean).join("\n");
}

export async function investigate(opts: { alarm: Alarm; drill?: boolean; generate: Generate; tools: Record<string, Tool>; maxCalls?: number; log?: (s: string) => void }): Promise<Investigation> {
  const { alarm, generate, tools, maxCalls = 15, log = () => {} } = opts;
  const declarations = Object.values(tools).map((t) => t.declaration);
  const contents: Content[] = [{ role: "user", parts: [{ text: alarmPrompt(alarm, !!opts.drill) }] }];
  const calls: Investigation["calls"] = [];
  const base = { systemInstruction: { parts: [{ text: SYSTEM }] }, tools: [{ functionDeclarations: declarations }] };

  for (let turn = 0; turn < maxCalls + 2; turn++) {
    const budgetLeft = calls.length < maxCalls;
    const res = await generate({ ...base, contents, ...(budgetLeft ? {} : { toolConfig: { functionCallingConfig: { mode: "NONE" } } }) });
    const content = res.candidates?.[0]?.content;
    if (!content) throw new Error(`Gemini returned no content (${res.promptFeedback?.blockReason ?? res.candidates?.[0]?.finishReason ?? "unknown"})`);
    contents.push(content); // thoughtSignature бар бөліктер өзгертусіз қайтады
    const wanted = callsOf(content);
    if (!wanted.length) {
      const report = textOf(content);
      if (report) return { report, calls };
      contents.push({ role: "user", parts: [{ text: "Write the final report now." }] });
      continue;
    }
    const responses: Part[] = [];
    for (const call of wanted) {
      const tool = tools[call.name];
      const args = call.args ?? {};
      let response: Record<string, unknown>;
      if (!budgetLeft || !tool) {
        response = { error: !tool ? `unknown tool ${call.name}` : "tool budget exhausted — write the report now" };
      } else {
        try {
          response = { result: clip(await tool.run(args)) }; // JSON мәтіні, ≤ 6000 таңба, жеке дерек жасырылған
        } catch (e) {
          response = { error: clip((e as Error).message, 500) };
        }
      }
      calls.push({ name: call.name, args, ok: !("error" in response) });
      log(`tool ${call.name} ${JSON.stringify(args)} → ${"error" in response ? "error" : "ok"}`);
      responses.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response } });
    }
    contents.push({ role: "user", parts: responses });
  }
  throw new Error("the model did not finish the report");
}

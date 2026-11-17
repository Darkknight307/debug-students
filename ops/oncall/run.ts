/**
 * On-call workflow-ының кіру нүктесі (#91): .github/workflows/oncall.yml.
 *   ALARM_JSON (repository_dispatch: Lambda жіберген alarm) не INPUT_ALARM/INPUT_STATE (қолмен жаттығу)
 *   GEMINI_API_KEY, GEMINI_MODEL, GH_TOKEN, GITHUB_REPOSITORY, AWS_REGION, EC2_INSTANCE_ID, SITE_URL, DEV_SITE_URL
 */
import { investigate, type Alarm } from "./agent";
import { geminiClient } from "./gemini";
import { ghIssues, respond } from "./github";
import { buildTools, realExec } from "./tools";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};

async function main() {
  const fromDispatch = process.env.ALARM_JSON && process.env.ALARM_JSON !== "null" ? (JSON.parse(process.env.ALARM_JSON) as Alarm) : null;
  const drill = !fromDispatch || /drill/i.test(fromDispatch.reason ?? "");
  const alarm: Alarm = fromDispatch ?? { name: need("INPUT_ALARM"), state: process.env.INPUT_STATE || "ALARM", reason: "Manual drill from GitHub Actions", time: new Date().toISOString() };
  const repo = need("GITHUB_REPOSITORY");
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  console.log(`alarm ${alarm.name} → ${alarm.state}${drill ? " (drill)" : ""}, model ${model}`);

  const outcome = await respond(alarm, ghIssues(repo, realExec), async () => {
    const tools = buildTools({ region: need("AWS_REGION"), instanceId: need("EC2_INSTANCE_ID"), siteUrl: need("SITE_URL"), devSiteUrl: need("DEV_SITE_URL"), repo });
    const started = Date.now();
    const { report, calls } = await investigate({ alarm, drill, generate: geminiClient(need("GEMINI_API_KEY"), model), tools, log: console.log });
    const run = `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID ?? ""}`;
    const footer = `_On-call agent: ${model}, ${calls.length} read-only tool calls (${[...new Set(calls.map((c) => c.name))].join(", ")}), ${Math.round((Date.now() - started) / 1000)} s · [run](${run}). The agent changes nothing; actions are for the owner._`;
    return { report, footer };
  }, drill);
  console.log(`issue: ${outcome.action}${outcome.issue ? ` #${outcome.issue}` : ""}`);
  // Issue жазылды, бірақ AI зерттеуі жүрмеді — run қызыл болып, иеге көрінсін
  if (outcome.degraded) throw new Error(`AI investigation failed: ${outcome.degraded}`);
}

main().catch((e) => {
  console.error("on-call agent failed:", (e as Error).message);
  process.exit(1);
});

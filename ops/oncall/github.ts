import type { Alarm } from "./agent";
import type { Exec } from "./tools";

/**
 * Инцидент issue-лары (#91): бір alarm — бір ашық `incident` issue. ALARM → жаңа issue не түсініктеме,
 * OK → «resolved» түсініктемесі және жабу. gh CLI (GH_TOKEN = workflow-тың GITHUB_TOKEN-і, issues: write).
 */
export type Issues = {
  findOpen(alarmName: string): Promise<number | null>;
  create(title: string, body: string): Promise<number>;
  comment(n: number, body: string): Promise<void>;
  close(n: number): Promise<void>;
};

export const marker = (alarmName: string) => `[${alarmName}]`;

export function ghIssues(repo: string, exec: Exec): Issues {
  return {
    async findOpen(alarmName) {
      const list = JSON.parse(await exec("gh", ["issue", "list", "--repo", repo, "--label", "incident", "--state", "open", "--limit", "50", "--json", "number,title"])) as { number: number; title: string }[];
      return list.find((i) => i.title.includes(marker(alarmName)))?.number ?? null;
    },
    async create(title, body) {
      const url = (await exec("gh", ["issue", "create", "--repo", repo, "--label", "incident", "--title", title, "--body", body])).trim();
      return Number(url.split("/").pop());
    },
    async comment(n, body) {
      await exec("gh", ["issue", "comment", String(n), "--repo", repo, "--body", body]);
    },
    async close(n) {
      await exec("gh", ["issue", "close", String(n), "--repo", repo, "--reason", "completed"]);
    },
  };
}

/** `degraded` — AI зерттеуі жүрмеді (мысалы, Gemini 402/429): issue бәрібір жазылады, себебі осында. */
export type Outcome = { action: "created" | "commented" | "closed" | "ignored"; issue: number | null; degraded?: string };

/** Модель қолжетімсіз болғанда: alert жоғалмайды — alarm деректері мен иеге арналған тексеру тізімі. */
export function fallbackReport(alarm: Alarm): string {
  return [
    "## Summary",
    `\`${alarm.name}\` is in ALARM. The AI investigation could not run, so this issue holds the raw alarm only.`,
    "",
    "## Evidence",
    `- Reason: ${alarm.reason ?? "—"}`,
    `- Time: ${alarm.time ?? "—"}`,
    ...(alarm.description ? [`- Alarm: ${alarm.description}`] : []),
    "",
    "## Recommended action",
    "1. Open the CloudWatch dashboard `debug-students` and this alarm's history.",
    "2. Check `/api/health` on production and the latest CI / Promote to production runs.",
    "3. Search the `/debug-students/app` log group for `api.error` around the alarm time.",
  ].join("\n");
}

/** Alarm күйі бойынша issue-мен не істеу керегін шешеді; ALARM-да есепті `investigate` жазады. */
export async function respond(alarm: Alarm, issues: Issues, investigate: () => Promise<{ report: string; footer: string }>, drill = false): Promise<Outcome> {
  const open = await issues.findOpen(alarm.name);
  if (alarm.state === "OK") {
    if (!open) return { action: "ignored", issue: null };
    await issues.comment(open, `✅ **Resolved** — \`${alarm.name}\` returned to OK at ${alarm.time ?? "now"}.\n\n> ${alarm.reason ?? ""}`);
    await issues.close(open);
    return { action: "closed", issue: open };
  }
  if (alarm.state !== "ALARM") return { action: "ignored", issue: open };
  let report: string, footer: string, degraded: string | undefined;
  try {
    ({ report, footer } = await investigate());
  } catch (e) {
    degraded = String((e as Error)?.message ?? e).replace(/\s+/g, " ").slice(0, 300);
    report = fallbackReport(alarm);
    footer = `_On-call agent unavailable — ${degraded}_`;
  }
  const extra = degraded ? { degraded } : {};
  const body = `${drill ? "> 🧪 Drill — triggered on purpose to test the on-call pipeline.\n\n" : ""}${report}\n\n---\n${footer}`;
  if (open) {
    await issues.comment(open, `🔁 **Still alarming** (${alarm.time ?? "now"})\n\n${body}`);
    return { action: "commented", issue: open, ...extra };
  }
  const title = `${drill ? "[drill] " : ""}Incident ${marker(alarm.name)}: ${(alarm.description || alarm.reason || "alarm").slice(0, 90)}`;
  return { action: "created", issue: await issues.create(title, body), ...extra };
}

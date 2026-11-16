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

export type Outcome = { action: "created" | "commented" | "closed" | "ignored"; issue: number | null };

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
  const { report, footer } = await investigate();
  const body = `${drill ? "> 🧪 Drill — triggered on purpose to test the on-call pipeline.\n\n" : ""}${report}\n\n---\n${footer}`;
  if (open) {
    await issues.comment(open, `🔁 **Still alarming** (${alarm.time ?? "now"})\n\n${body}`);
    return { action: "commented", issue: open };
  }
  const title = `${drill ? "[drill] " : ""}Incident ${marker(alarm.name)}: ${(alarm.description || alarm.reason || "alarm").slice(0, 90)}`;
  return { action: "created", issue: await issues.create(title, body) };
}

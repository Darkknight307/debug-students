import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FunctionDeclaration } from "./gemini";

/**
 * On-call агентінің құралдары (#91) — бәрі ТЕК ОҚИДЫ: CloudWatch alarm/метрика, CloudWatch Logs Insights, X-Ray,
 * EC2 күйі, health, соңғы деплойлар. AWS CLI мен gh CLI GitHub runner-де бар; AWS рөлі read-only (OnCallRole).
 * Нәтиже қысқартылады (≤ 6000 таңба) — модельге артық мәтін және жеке дерек жіберілмейді.
 */
export type Env = { region: string; instanceId: string; siteUrl: string; devSiteUrl: string; repo: string };
export type Exec = (cmd: string, args: string[]) => Promise<string>;
export type Tool = { declaration: FunctionDeclaration; run: (args: Record<string, unknown>) => Promise<unknown> };

const pexec = promisify(execFile);
export const realExec: Exec = async (cmd, args) => (await pexec(cmd, args, { maxBuffer: 4 * 1024 * 1024, timeout: 60_000 })).stdout;

const METRICS = ["http_latency", "http_5xx", "registrations", "submissions", "login_failures", "cpu"] as const;
const STATS = ["Sum", "Average", "Maximum", "SampleCount"] as const;
const ENVS = ["production", "development"] as const;
const PRIVATE = /("?(email|phone|full_name|first_name|last_name|password|token|cookie)"?\s*[:=]\s*)"[^"]*"/gi;

export const clip = (v: unknown, max = 6000) => {
  const s = (typeof v === "string" ? v : JSON.stringify(v)).replace(PRIVATE, '$1"[hidden]"');
  return s.length > max ? s.slice(0, max) + `… [${s.length - max} chars cut]` : s;
};
const num = (v: unknown, def: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(Number(v)) ? Number(v) : def));
const oneOf = <T extends readonly string[]>(v: unknown, list: T, def: T[number]): T[number] => (list.includes(String(v)) ? (String(v) as T[number]) : def);
const iso = (minutesAgo: number, now: number) => new Date(now - minutesAgo * 60_000).toISOString();

export function buildTools(env: Env, exec: Exec = realExec, fetchImpl: typeof fetch = fetch, now = () => Date.now()): Record<string, Tool> {
  const aws = async (args: string[]) => JSON.parse((await exec("aws", [...args, "--region", env.region, "--output", "json"])) || "{}");
  return {
    alarm_details: {
      declaration: {
        name: "alarm_details",
        description: "Configuration, current state and the last state changes of a CloudWatch alarm.",
        parameters: { type: "object", properties: { alarm_name: { type: "string" } }, required: ["alarm_name"] },
      },
      run: async ({ alarm_name }) => {
        const name = String(alarm_name).replace(/[^\w.-]/g, "");
        const [d, h] = await Promise.all([
          aws(["cloudwatch", "describe-alarms", "--alarm-names", name]),
          aws(["cloudwatch", "describe-alarm-history", "--alarm-name", name, "--history-item-type", "StateUpdate", "--max-records", "10"]),
        ]);
        const a = [...(d.MetricAlarms ?? []), ...(d.CompositeAlarms ?? [])][0];
        return {
          alarm: a && { name: a.AlarmName, description: a.AlarmDescription, state: a.StateValue, reason: a.StateReason, metric: a.MetricName, threshold: a.Threshold, comparison: a.ComparisonOperator, period: a.Period, metrics: a.Metrics },
          history: (h.AlarmHistoryItems ?? []).map((i: Record<string, string>) => ({ time: i.Timestamp, summary: i.HistorySummary })),
        };
      },
    },
    metric_series: {
      declaration: {
        name: "metric_series",
        description:
          "Time series of an application metric (namespace DebugStudents, dimension env) or server CPU. http_latency is milliseconds per request (use Average/Maximum, SampleCount = number of requests); the others are counts (use Sum).",
        parameters: {
          type: "object",
          properties: {
            metric: { type: "string", enum: [...METRICS] },
            env: { type: "string", enum: [...ENVS] },
            stat: { type: "string", enum: [...STATS] },
            minutes: { type: "integer", description: "How far back, 15–1440 (default 120)" },
            period_seconds: { type: "integer", description: "60, 300 or 3600 (default 300)" },
          },
          required: ["metric"],
        },
      },
      run: async (a) => {
        const metric = oneOf(a.metric, METRICS, "http_5xx");
        const envName = oneOf(a.env, ENVS, "production");
        const stat = oneOf(a.stat, STATS, metric === "http_latency" || metric === "cpu" ? "Average" : "Sum");
        const minutes = num(a.minutes, 120, 15, 1440);
        const period = [60, 300, 3600].includes(Number(a.period_seconds)) ? Number(a.period_seconds) : 300;
        const m = metric === "cpu"
          ? { Namespace: "AWS/EC2", MetricName: "CPUUtilization", Dimensions: [{ Name: "InstanceId", Value: env.instanceId }] }
          : { Namespace: "DebugStudents", MetricName: metric, Dimensions: [{ Name: "env", Value: envName }] };
        const q = [{ Id: "m", MetricStat: { Metric: m, Period: period, Stat: stat }, ReturnData: true }];
        const r = await aws(["cloudwatch", "get-metric-data", "--metric-data-queries", JSON.stringify(q), "--start-time", iso(minutes, now()), "--end-time", iso(0, now())]);
        const s = r.MetricDataResults?.[0] ?? {};
        const points = (s.Timestamps ?? []).map((t: string, i: number) => [t, s.Values[i]]).reverse();
        return { metric, env: metric === "cpu" ? "server" : envName, stat, period, points, note: points.length ? undefined : "no datapoints (no traffic or no events in this window)" };
      },
    },
    search_logs: {
      declaration: {
        name: "search_logs",
        description: "Search the application logs (CloudWatch Logs /debug-students/app, JSON lines: event, level, env, message) with a plain substring, newest first.",
        parameters: {
          type: "object",
          properties: { contains: { type: "string", description: "Substring, e.g. api.error, ERROR, health.db_down, auth.login_failed" }, minutes: { type: "integer" }, limit: { type: "integer" } },
          required: ["contains"],
        },
      },
      run: async (a) => {
        const text = String(a.contains ?? "").replace(/[^\w .:@-]/g, "").slice(0, 60) || "ERROR";
        const minutes = num(a.minutes, 60, 5, 1440), limit = num(a.limit, 20, 1, 50);
        const start = Math.floor((now() - minutes * 60_000) / 1000), end = Math.floor(now() / 1000);
        const query = `fields @timestamp, @message | filter @message like "${text}" | sort @timestamp desc | limit ${limit}`;
        const { queryId } = await aws(["logs", "start-query", "--log-group-name", "/debug-students/app", "--start-time", String(start), "--end-time", String(end), "--query-string", query]);
        for (let i = 0; i < 20; i++) {
          const r = await aws(["logs", "get-query-results", "--query-id", queryId]);
          if (r.status === "Complete" || r.status === "Failed" || r.status === "Cancelled") {
            return { status: r.status, matches: (r.results ?? []).map((row: { field: string; value: string }[]) => Object.fromEntries(row.filter((f) => f.field !== "@ptr").map((f) => [f.field, f.value]))) };
          }
          await new Promise((res) => setTimeout(res, 1500));
        }
        return { status: "Timeout" };
      },
    },
    recent_traces: {
      declaration: {
        name: "recent_traces",
        description: "AWS X-Ray trace summaries for the last minutes: failed requests (5xx/errors) or slow ones (over 2 s). Production traces are sampled (all 5xx are kept).",
        parameters: { type: "object", properties: { kind: { type: "string", enum: ["errors", "slow"] }, minutes: { type: "integer" } }, required: ["kind"] },
      },
      run: async (a) => {
        const minutes = num(a.minutes, 60, 5, 360);
        const filter = a.kind === "slow" ? "duration > 2" : "fault = true OR error = true";
        const r = await aws(["xray", "get-trace-summaries", "--start-time", iso(minutes, now()), "--end-time", iso(0, now()), "--filter-expression", filter]);
        return {
          count: (r.TraceSummaries ?? []).length,
          traces: (r.TraceSummaries ?? []).slice(0, 15).map((t: Record<string, any>) => ({ id: t.Id, at: t.StartTime, duration_s: t.Duration, url: t.Http?.HttpURL, status: t.Http?.HttpStatus, fault: t.HasFault, error: t.HasError, annotations: t.Annotations })),
        };
      },
    },
    site_health: {
      declaration: {
        name: "site_health",
        description: "Live /api/health (db up/down, env, running version = git SHA) and HTTP status of the landing and leaderboard for production or development.",
        parameters: { type: "object", properties: { env: { type: "string", enum: [...ENVS] } }, required: ["env"] },
      },
      run: async (a) => {
        const base = oneOf(a.env, ENVS, "production") === "development" ? env.devSiteUrl : env.siteUrl;
        const get = async (p: string) => {
          const t0 = now();
          try {
            const r = await fetchImpl(base + p, { signal: AbortSignal.timeout(10_000) });
            return { path: p, status: r.status, ms: now() - t0, body: p === "/api/health" ? await r.json().catch(() => null) : undefined };
          } catch (e) {
            return { path: p, error: (e as Error).message };
          }
        };
        return { url: base, checks: await Promise.all(["/api/health", "/", "/board"].map(get)) };
      },
    },
    recent_deploys: {
      declaration: {
        name: "recent_deploys",
        description: "Recent CI runs (push → development deploy) and production promotions with their commit SHA, time and result, plus the last commits on main.",
      },
      run: async () => {
        const runs = async (wf: string) =>
          JSON.parse(await exec("gh", ["run", "list", "--repo", env.repo, "--workflow", wf, "--limit", "5", "--json", "headSha,conclusion,status,createdAt,displayTitle,event"]));
        const commits = JSON.parse(await exec("gh", ["api", `repos/${env.repo}/commits?per_page=8`, "--jq", "[.[] | {sha: .sha, date: .commit.author.date, message: (.commit.message | split(\"\\n\")[0])}]"]));
        return { ci_and_dev_deploys: await runs("ci.yml"), production_promotions: await runs("promote.yml").catch(() => []), commits };
      },
    },
    server_status: {
      declaration: { name: "server_status", description: "EC2 instance and system status checks of the server." },
      run: async () => {
        const r = await aws(["ec2", "describe-instance-status", "--instance-ids", env.instanceId, "--include-all-instances"]);
        const s = r.InstanceStatuses?.[0];
        return s && { state: s.InstanceState?.Name, instance: s.InstanceStatus?.Status, system: s.SystemStatus?.Status, events: s.Events };
      },
    },
  };
}

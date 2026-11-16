import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { deployEnv } from "./otel";

/**
 * Құрылымды лог (#88): консольге бір JSON жол + OpenTelemetry лог жазбасы (collector → CloudWatch Logs).
 * Жеке дерек ешқашан жазылмайды: email, телефон, аты-жөні, құпия сөз, токен, cookie кілттері алынып тасталады.
 */
export type Level = "info" | "warn" | "error";
const SEVERITY: Record<Level, SeverityNumber> = { info: SeverityNumber.INFO, warn: SeverityNumber.WARN, error: SeverityNumber.ERROR };
const PRIVATE = /^(email|phone|password|token|secret|cookie|name|full_name|first_name|last_name|university|code)$/i;

export type LogAttrs = Record<string, string | number | boolean | null | undefined>;

export function sanitize(attrs: LogAttrs): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && !PRIVATE.test(k)) out[k] = v;
  return out;
}

export function log(level: Level, event: string, attrs: LogAttrs = {}) {
  const clean = { ...sanitize(attrs), env: deployEnv() };
  const line = JSON.stringify({ level, event, ...clean });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  logs.getLogger("debug-students").emit({ severityNumber: SEVERITY[level], severityText: level.toUpperCase(), body: event, attributes: { event, ...clean } });
}

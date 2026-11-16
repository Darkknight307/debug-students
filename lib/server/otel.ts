import { metrics, type Attributes } from "@opentelemetry/api";

/**
 * OpenTelemetry API жағы (#88, #89): ортаның аты және қолданба метрикаларының аспаптары. Тек @opentelemetry/api —
 * маршрут бумаларына SDK кірмейді; SDK-ны instrumentation.ts → telemetry.ts іске қосады, онсыз бәрі no-op.
 */

export type DeployEnv = "production" | "development" | "local";
export const deployEnv = (env: Record<string, string | undefined> = process.env): DeployEnv =>
  env.DEPLOY_ENV === "production" || env.DEPLOY_ENV === "development" ? env.DEPLOY_ENV : "local";

/** Метрика нүктелерінің жалғыз өлшемі (CloudWatch-та метрика ағындарының саны аз болсын). */
export const metricAttrs = (): Attributes => ({ env: deployEnv() });

type Instruments = {
  latency: ReturnType<ReturnType<typeof metrics.getMeter>["createHistogram"]>;
  errors: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
  registrations: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
  submissions: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
  loginFailures: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
};
const g = globalThis as unknown as { __debugInstruments?: Instruments };

/** Аспаптар провайдер тіркелгеннен кейін бір рет құрылады (globalThis — барлық маршрут бумасына ортақ, #84). */
export function instruments(): Instruments {
  if (g.__debugInstruments) return g.__debugInstruments;
  const meter = metrics.getMeter("debug-students");
  g.__debugInstruments = {
    latency: meter.createHistogram("http_latency", { unit: "ms", description: "Server time per HTTP request (health and static files excluded)" }),
    errors: meter.createCounter("http_5xx", { description: "HTTP responses with status 5xx" }),
    registrations: meter.createCounter("registrations", { description: "New student accounts" }),
    submissions: meter.createCounter("submissions", { description: "Trace answers and Debug/Build code submissions" }),
    loginFailures: meter.createCounter("login_failures", { description: "Failed student and admin logins" }),
  };
  return g.__debugInstruments;
}

/** Тек тесттер үшін: жаңа MeterProvider-ден кейін аспаптарды қайта құру. */
export function resetInstruments() {
  delete g.__debugInstruments;
}


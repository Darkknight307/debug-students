// OpenTelemetry (#88) және қолданба метрикалары (#89): SDK-сыз no-op, сұраныс span-дарынан HTTP метрикалары,
// оқиға санағыштары, X-Ray-ге жіберу сүзгісі, логта жеке дерек жоқ.
import assert from "node:assert/strict";
import { test } from "node:test";
import { metrics } from "@opentelemetry/api";
import { AggregationTemporality, InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-node";
import { ExportFilterProcessor, RequestMetricsProcessor, keepSpan, startTelemetry } from "../../lib/server/telemetry.ts";
import type { SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { resetInstruments } from "../../lib/server/otel.ts";
import { recordLoginFailure, recordRegistration, recordRoundAction, recordSubmission } from "../../lib/server/events.ts";
import { sanitize } from "../../lib/server/log.ts";

process.env.DEPLOY_ENV = "production";
const exporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 3_600_000 });
metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
resetInstruments();

async function collected() {
  await reader.forceFlush();
  const out: Record<string, { value: unknown; attrs: Record<string, unknown> }[]> = {};
  for (const rm of exporter.getMetrics()) for (const sm of rm.scopeMetrics) for (const m of sm.metrics) {
    out[m.descriptor.name] = [...(out[m.descriptor.name] ?? []), ...m.dataPoints.map((d) => ({ value: d.value, attrs: d.attributes }))];
  }
  exporter.reset();
  return out;
}

const span = (target: string, status: number, ms: number, traceId = "0".repeat(24) + "00000001") =>
  ({
    attributes: { "next.span_type": "BaseServer.handleRequest", "http.target": target, "http.status_code": status },
    duration: [Math.floor(ms / 1000), (ms % 1000) * 1e6],
    spanContext: () => ({ traceId, spanId: "1".repeat(16), traceFlags: 1 }),
  }) as unknown as ReadableSpan;

test("OTEL_EXPORTER_OTLP_ENDPOINT жоқ — SDK іске қосылмайды (Vercel, тесттер)", () => {
  assert.equal(startTelemetry({}), null);
});

test("сұраныс span-дарынан http_latency (ms) және http_5xx; health мен статика есептелмейді (#89)", async () => {
  const p = new RequestMetricsProcessor();
  p.onEnd(span("/api/contest/state", 200, 120));
  p.onEnd(span("/api/auth/login", 503, 40));
  p.onEnd(span("/api/health", 200, 3));
  p.onEnd(span("/_next/static/chunks/a.js", 200, 1));
  p.onEnd({ ...span("/x", 500, 5), attributes: { "next.span_type": "AppRender.getBodyResult" } } as unknown as ReadableSpan);
  const m = await collected();
  const h = m.http_latency[0];
  const v = h.value as { count: number; sum: number; max?: number };
  assert.deepEqual([v.count, Math.round(v.sum), h.attrs], [2, 160, { env: "production" }]);
  assert.deepEqual(m.http_5xx.map((d) => [d.value, d.attrs]), [[1, { env: "production" }]]);
});

test("қолданба оқиғалары: тіркелу, жауап/жіберілім, сәтсіз кіру — тек env өлшемімен (#89)", async () => {
  recordRegistration();
  recordSubmission("answer", true);
  recordSubmission("code", false);
  recordLoginFailure("student");
  recordLoginFailure("admin");
  const m = await collected();
  assert.deepEqual([m.registrations[0].value, m.submissions[0].value, m.login_failures[0].value], [1, 2, 2]);
  for (const k of ["registrations", "submissions", "login_failures"]) assert.deepEqual(m[k][0].attrs, { env: "production" });
});

test("оператордың кезең әрекеттері құрылымды логқа жазылады — кезең id-і, студенттің дерегі жоқ (#88)", (t) => {
  const lines: string[] = [];
  t.mock.method(console, "log", (l: string) => void lines.push(l));
  recordRoundAction("start", "r-1");
  recordRoundAction("extend", "r-1", { minutes: 10 });
  recordRoundAction("extension", "r-1", { extra_min: 15 });
  assert.deepEqual(lines.map((l) => JSON.parse(l)), [
    { level: "info", event: "admin.round_start", round_id: "r-1", env: "production" },
    { level: "info", event: "admin.round_extend", round_id: "r-1", minutes: 10, env: "production" },
    { level: "info", event: "admin.round_extension", round_id: "r-1", extra_min: 15, env: "production" },
  ]);
});

test("X-Ray сүзгісі: health жоқ, 5xx әрдайым, қалғаны trace id бойынша тұрақты үлес", () => {
  assert.equal(keepSpan(span("/api/health", 200, 1), 1), false);
  assert.equal(keepSpan(span("/api/board", 500, 10), 0), true);
  assert.equal(keepSpan(span("/api/board", 200, 10), 0), false);
  assert.equal(keepSpan(span("/api/board", 200, 10), 1), true);
  const low = "0".repeat(24) + "10000000", high = "0".repeat(24) + "f0000000";
  assert.deepEqual([keepSpan(span("/", 200, 1, low), 0.2), keepSpan(span("/", 200, 1, high), 0.2)], [true, false]);
});

test("логта жеке дерек жоқ: email, телефон, аты-жөні, код, құпия сөз алынады", () => {
  assert.deepEqual(
    sanitize({ event: "x", email: "a@mock.test", phone: "+7", full_name: "Серіков Айдос", code: "def f", password: "p", status_code: 500, who: "admin", none: undefined }),
    { event: "x", status_code: 500, who: "admin" },
  );
});

test("health trace-інің ішкі span-дары да X-Ray-ге кетпейді (түбір басталғанда белгіленеді)", () => {
  const sent: string[] = [];
  const sink = { onStart() {}, onEnd: (sp: ReadableSpan) => void sent.push(String(sp.attributes["n"])), forceFlush: async () => {}, shutdown: async () => {} } as unknown as SpanProcessor;
  const p = new ExportFilterProcessor(sink, 1);
  const healthRoot = { ...span("/api/health", 200, 2, "a".repeat(32)), attributes: { ...span("/api/health", 200, 2).attributes, n: "root" } } as unknown as ReadableSpan;
  const child = { attributes: { n: "child" }, spanContext: () => ({ traceId: "a".repeat(32) }) } as unknown as ReadableSpan;
  const other = { attributes: { n: "other" }, spanContext: () => ({ traceId: "b".repeat(32) }) } as unknown as ReadableSpan;
  p.onStart(healthRoot as never, {} as never);
  p.onEnd(child);
  p.onEnd(healthRoot);
  p.onEnd(other);
  assert.deepEqual(sent, ["other"]);
});

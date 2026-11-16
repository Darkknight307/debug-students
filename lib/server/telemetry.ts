import { metrics } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { AlwaysOnSampler, BatchSpanProcessor, NodeTracerProvider, type ReadableSpan, type Span, type SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { AggregationTemporalityPreference, OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import type { Context } from "@opentelemetry/api";
import { deployEnv, instruments, metricAttrs, resetInstruments } from "./otel";

/**
 * OpenTelemetry (#88): trace, метрика, лог → OTLP/HTTP → ADOT collector → X-Ray, CloudWatch Metrics, CloudWatch Logs.
 * OTEL_EXPORTER_OTLP_ENDPOINT берілмесе (Vercel, жергілікті, тесттер) — ештеңе қосылмайды, API no-op күйінде қалады.
 * Барлық span жазылады (AlwaysOn): HTTP метрикалары Next.js сұраныс span-дарынан алынады, ал X-Ray-ге тек
 * OTEL_TRACES_SAMPLER_ARG үлесі (trace id бойынша тұрақты) және барлық 5xx жіберіледі — тегін шектің ішінде.
 */

/** Next.js-тің әр HTTP сұранысына ашатын түбір span-ы. */
export const isRequestSpan = (s: ReadableSpan) => s.attributes["next.span_type"] === "BaseServer.handleRequest";
const statusOf = (s: ReadableSpan) => Number(s.attributes["http.status_code"] ?? 0);
const targetOf = (s: ReadableSpan) => String(s.attributes["http.target"] ?? s.attributes["http.route"] ?? s.attributes["next.route"] ?? "");
/** Метрика мен trace-ке жатпайтын шу: Docker/CI health тексерісі, статикалық файлдар. */
export const isNoise = (target: string) => /^\/(api\/health|_next\/|fonts\/|t\/|favicon)/.test(target);
const durationMs = (s: ReadableSpan) => s.duration[0] * 1e3 + s.duration[1] / 1e6;

/** Next.js сұраныс span-дарынан HTTP метрикалары: http_latency (ms) және http_5xx. */
export class RequestMetricsProcessor implements SpanProcessor {
  onStart(_span: Span, _ctx: Context): void {}
  onEnd(span: ReadableSpan): void {
    if (!isRequestSpan(span) || isNoise(targetOf(span))) return;
    const m = instruments();
    m.latency.record(durationMs(span), metricAttrs());
    if (statusOf(span) >= 500) m.errors.add(1, metricAttrs());
  }
  forceFlush() {
    return Promise.resolve();
  }
  shutdown() {
    return Promise.resolve();
  }
}

/** X-Ray-ге жіберуді сүзеді: health/статика жоқ, 5xx түбір span-дары әрдайым, қалғаны trace id бойынша `ratio` үлесі. */
export class ExportFilterProcessor implements SpanProcessor {
  /** health/статика trace-тері: ішкі span-дар түбірден бұрын бітеді, сондықтан шешім түбір басталғанда сақталады. */
  private noisy = new Set<string>();
  constructor(private next: SpanProcessor, private ratio: number) {}
  onStart(span: Span, ctx: Context): void {
    const s = span as unknown as ReadableSpan;
    if (isRequestSpan(s) && isNoise(targetOf(s))) this.noisy.add(s.spanContext().traceId);
    this.next.onStart(span, ctx);
  }
  onEnd(span: ReadableSpan): void {
    const traceId = span.spanContext().traceId;
    const noisy = this.noisy.has(traceId);
    if (isRequestSpan(span)) this.noisy.delete(traceId);
    if (!noisy && keepSpan(span, this.ratio)) this.next.onEnd(span);
  }
  forceFlush() {
    return this.next.forceFlush();
  }
  shutdown() {
    return this.next.shutdown();
  }
}

export function keepSpan(span: ReadableSpan, ratio: number): boolean {
  if (isRequestSpan(span) && isNoise(targetOf(span))) return false;
  if (isRequestSpan(span) && statusOf(span) >= 500) return true;
  // trace id-нің соңғы 8 hex таңбасы — бір trace-тің барлық span-ы бірдей шешім алады
  const x = parseInt(span.spanContext().traceId.slice(-8), 16) / 0xffffffff;
  return x < ratio;
}

export function startTelemetry(env: Record<string, string | undefined> = process.env) {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/+$/, "");
  if (!endpoint) return null;
  const resource = resourceFromAttributes({
    "service.name": env.OTEL_SERVICE_NAME || "debug-students",
    "service.version": env.APP_VERSION || "dev",
    "deployment.environment": deployEnv(env),
  });
  const ratio = Math.min(1, Math.max(0, Number(env.OTEL_TRACES_SAMPLER_ARG ?? "0.2") || 0));

  const tracerProvider = new NodeTracerProvider({
    resource,
    sampler: new AlwaysOnSampler(),
    spanProcessors: [
      new RequestMetricsProcessor(),
      new ExportFilterProcessor(new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })), ratio),
    ],
  });
  tracerProvider.register();

  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        // DELTA: CloudWatch-қа әр минуттың өз мәні барады (EMF)
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics`, temporalityPreference: AggregationTemporalityPreference.DELTA }),
        exportIntervalMillis: Number(env.OTEL_METRIC_EXPORT_INTERVAL || 60_000),
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);
  resetInstruments();

  const loggerProvider = new LoggerProvider({ resource, processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${endpoint}/v1/logs` }) })] });
  logs.setGlobalLoggerProvider(loggerProvider);

  const stop = () => Promise.allSettled([tracerProvider.shutdown(), meterProvider.shutdown(), loggerProvider.shutdown()]);
  process.once("SIGTERM", () => void stop());
  return { tracerProvider, meterProvider, loggerProvider, stop };
}

/**
 * Next.js сервері іске қосылғанда бір рет (#88): OpenTelemetry SDK — тек Node runtime-та және тек
 * OTEL_EXPORTER_OTLP_ENDPOINT берілсе (AWS-тегі Docker стегі). Vercel, жергілікті dev және тесттерде ештеңе қосылмайды.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const { startTelemetry } = await import("./lib/server/telemetry");
    startTelemetry();
  }
}

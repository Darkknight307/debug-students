import { currentStudent } from "../../../../lib/currentStudent";
import { isServerConfigured, supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { loadContext, tooFast } from "../../../../lib/contest/server";
import { fail, ok, readJson } from "../../../../lib/contest/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Кезең жабылған соң да соңғы дерек жетсін деп берілетін уақыт. */
const LATE_MS = 3 * 60_000;
const MAX_TASKS = 30;

const num = (v: unknown, max = 100_000_000) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);

/** Оқушы браузерінен келген дерекке сенбейміз: тек белгілі сандық өрістер, шектелген мәндермен. */
function sanitize(raw: unknown) {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const tasks: Record<string, Record<string, number | null>> = {};
  const src = (d.tasks && typeof d.tasks === "object" ? d.tasks : {}) as Record<string, unknown>;
  for (const [id, v] of Object.entries(src).slice(0, MAX_TASKS)) {
    if (!/^[0-9a-f-]{36}$/i.test(id) || !v || typeof v !== "object") continue;
    const t = v as Record<string, unknown>;
    tasks[id] = {
      keys: num(t.keys, 1_000_000), dels: num(t.dels, 1_000_000), blocked: num(t.blocked, 100_000),
      checks: num(t.checks, 100_000), check_fails: num(t.check_fails, 100_000), pauses: num(t.pauses, 100_000),
      active_ms: num(t.active_ms), think_ms: t.think_ms === null || t.think_ms === undefined ? null : num(t.think_ms),
    };
  }
  return { hidden_count: num(d.hidden_count, 100_000), hidden_ms: num(d.hidden_ms), blur_count: num(d.blur_count, 100_000), blur_ms: num(d.blur_ms), tasks };
}

let warned = false;

/** Бақылау дерегін сақтайды (бір оқушыға бір кезеңге бір жол, соңғысы алдыңғысын алмастырады). */
export async function POST(req: Request) {
  if (!isServerConfigured()) return fail(500, "Сервер әлі бапталмаған");
  const student = await currentStudent().catch(() => null);
  if (!student) return fail(401, "Алдымен сайтқа кіріңіз");

  const body = await readJson(req);
  const roundId = typeof body?.roundId === "string" ? body.roundId : "";
  if (!roundId) return fail(400, "Кезең көрсетілмеген");
  if (tooFast(`act:${student.id}`, 4_000)) return ok({ stored: false });

  const now = Date.now();
  const ctx = await loadContext(student.id, now);
  const w = ctx?.windows.find((x) => x.round.id === roundId);
  if (!ctx || !w || w.state === "pending" || (w.endsAt !== null && now - w.endsAt > LATE_MS)) return ok({ stored: false });

  const { error } = await supabaseAdmin()
    .from("activity")
    .upsert(
      { round_id: roundId, student_id: student.id, contest_id: ctx.contest.id, data: sanitize(body?.data), updated_at: new Date(now).toISOString() },
      { onConflict: "round_id,student_id" },
    );
  if (error) {
    // 007_activity.sql әлі орындалмаған болса кесте жоқ — жарысқа кедергі жасамаймыз
    if (!warned) {
      warned = true;
      console.error("[activity] upsert:", error.message);
    }
    return ok({ stored: false });
  }
  return ok({ stored: true });
}

import { instruments, metricAttrs } from "./otel";
import { log } from "./log";

/**
 * Қолданбаға тән оқиғалар (#89): CloudWatch метрикасы + құрылымды лог. Жеке дерек жоқ — тек оқиғаның түрі.
 * Телеметрия қосылмаған ортада (Vercel, тесттер) метрика no-op, лог тек консольге.
 */
export function recordRegistration() {
  instruments().registrations.add(1, metricAttrs());
  log("info", "auth.registered");
}

export function recordSubmission(kind: "answer" | "code", correct: boolean) {
  instruments().submissions.add(1, metricAttrs());
  if (kind === "code") log("info", "contest.code_submitted", { correct });
}

export function recordLoginFailure(who: "student" | "admin") {
  instruments().loginFailures.add(1, metricAttrs());
  log("warn", "auth.login_failed", { who });
}

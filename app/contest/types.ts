export type {
  Kind, RoundInfo, TestCase, McqTask, CodeTask, Mine, ActiveFull, StateResponse,
} from "../../lib/client/types";
import type { Kind } from "../../lib/client/types";

export const KIND_SHORT: Record<Kind, string> = { mcq: "Trace", debug: "Debug", code: "Build" };
export const KIND_HINT: Record<Kind, string> = {
  mcq: "Кодты оқып, нәтижесін таңда",
  debug: "Қатені тап — бір жолды түзет",
  code: "Функцияны өзің жаз",
};

/** JSON мәнін Python түрінде көрсету: null → None, true → True, 'жол'. */
export function pyRepr(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'";
  if (Array.isArray(v)) return "[" + v.map(pyRepr).join(", ") + "]";
  if (typeof v === "object") return "{" + Object.entries(v as Record<string, unknown>).map(([k, x]) => pyRepr(k) + ": " + pyRepr(x)).join(", ") + "}";
  return String(v);
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}

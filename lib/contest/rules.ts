/**
 * Жауапты тексеру ережелері. Сервер де, браузер де осы файлды қолданады
 * (браузерде — жіберер алдында оқушыға ескерту үшін; шешуші тексеріс — серверде).
 */

export type CodeTask = {
  kind: "debug" | "code";
  starter_code: string | null;
  max_changed_lines: number | null;
  forbidden: string[] | null;
};

export type RuleResult =
  | { ok: true; changed: number }
  | { ok: false; reason: "lines" | "forbidden" | "empty" | "too_long"; message: string; changed: number };

export const MAX_CODE_CHARS = 20_000;

/** Apps Script-тегі normalize() дәл көшірмесі: бос орындар алынады, ' → ", кіші әріп. */
export function normalizeAnswer(v: unknown): string {
  return String(v).replace(/\s+/g, "").replace(/'/g, '"').toLowerCase();
}

/**
 * Өзгерген жолдар саны. Бос жолдар мен жол соңындағы бос орындар есепке алынбайды,
 * ал шегініс өзгерсе — ол өзгеріс (Python-да шегініс мағыналы).
 * Бір жолды түзету = 1, жол қосу = 1, жол өшіру = 1.
 */
export function changedLines(before: string, after: string): number {
  const prep = (s: string) =>
    s.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim() !== "");
  const a = prep(before);
  const b = prep(after);
  const n = a.length;
  const m = b.length;

  // LCS кестесі — код қысқа, O(n·m) жеткілікті
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // Ортақ жолдар арасындағы әр блокта: өшірілген мен қосылғанның үлкені
  let i = 0;
  let j = 0;
  let total = 0;
  let removed = 0;
  let added = 0;
  const flush = () => {
    total += Math.max(removed, added);
    removed = 0;
    added = 0;
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flush();
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      removed++;
      i++;
    } else {
      added++;
      j++;
    }
  }
  removed += n - i;
  added += m - j;
  flush();
  return total;
}

export function checkCode(task: CodeTask, code: string): RuleResult {
  if (!code.trim()) return { ok: false, reason: "empty", message: "Код бос", changed: 0 };
  if (code.length > MAX_CODE_CHARS) return { ok: false, reason: "too_long", message: "Код тым ұзын", changed: 0 };

  const changed = task.kind === "debug" ? changedLines(task.starter_code ?? "", code) : 0;
  if (task.kind === "debug") {
    const max = task.max_changed_lines ?? 1;
    if (changed > max) {
      return {
        ok: false,
        reason: "lines",
        message: `Тек ${max} жолды өзгертуге болады — сіз ${changed} жолды өзгерттіңіз`,
        changed,
      };
    }
  }
  for (const f of task.forbidden ?? []) {
    if (f && code.includes(f)) return { ok: false, reason: "forbidden", message: `«${f}» қолдануға болмайды`, changed };
  }
  return { ok: true, changed };
}

/** Әр тест бойынша: оқушы шығысы мен дұрыс жауап normalize-тен кейін тең бе. */
export function compareOutputs(outputs: unknown, expected: string[]): boolean {
  if (!Array.isArray(outputs) || outputs.length !== expected.length) return false;
  return expected.every((e, k) => typeof outputs[k] === "string" && normalizeAnswer(outputs[k]) === normalizeAnswer(e));
}

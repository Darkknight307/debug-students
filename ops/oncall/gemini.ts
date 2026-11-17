/**
 * Gemini API (REST, тәуелділіксіз) — on-call агенті үшін (#91). generateContent + function calling.
 * Модельдің жауабы (thoughtSignature бар бөліктерімен) келесі сұранысқа өзгертусіз қайтарылады.
 */
export type FunctionCall = { id?: string; name: string; args?: Record<string, unknown> };
export type Part = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: FunctionCall;
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
};
export type Content = { role: "user" | "model"; parts: Part[] };
export type FunctionDeclaration = { name: string; description: string; parameters?: Record<string, unknown> };
export type GenerateRequest = {
  systemInstruction?: { parts: { text: string }[] };
  contents: Content[];
  tools?: { functionDeclarations: FunctionDeclaration[] }[];
  toolConfig?: { functionCallingConfig: { mode: "AUTO" | "NONE" } };
  generationConfig?: Record<string, unknown>;
};
export type GenerateResponse = {
  candidates?: { content?: Content; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};
export type Generate = (req: GenerateRequest) => Promise<GenerateResponse>;

const API = "https://generativelanguage.googleapis.com/v1beta/models";

type GoogleError = {
  error?: {
    status?: string;
    message?: string;
    details?: { retryDelay?: string; violations?: { quotaId?: string; quotaMetric?: string; quotaValue?: string; quotaDimensions?: { model?: string } }[] }[];
  };
};

/**
 * Google қатесінің қысқа түсіндірмесі: статус, квота (атауы=шегі, модель), хабардың бірінші сөйлемі.
 * `retryMs` — Google ұсынған күту; `hopeless` — шегі 0 не күндік квота таусылған (қайталау көмектеспейді).
 */
export function describeError(status: number, text: string): { message: string; retryMs?: number; hopeless: boolean } {
  try {
    const e = (JSON.parse(text) as GoogleError).error ?? {};
    const details = e.details ?? [];
    const quotas = details.flatMap((d) => d.violations ?? []).map((v) => `quota ${v.quotaId ?? v.quotaMetric ?? "?"}=${v.quotaValue ?? "?"}${v.quotaDimensions?.model ? ` (${v.quotaDimensions.model})` : ""}`);
    const delay = details.find((d) => d.retryDelay)?.retryDelay;
    const first = String(e.message ?? "").split(/\n|(?<=\.) /)[0].trim();
    return {
      message: [`Gemini HTTP ${status}${e.status ? ` ${e.status}` : ""}`, ...quotas, first].filter(Boolean).join("; "),
      retryMs: delay ? Math.ceil(parseFloat(delay) * 1000) : undefined,
      hopeless: quotas.some((q) => /=0(\s|$)/.test(q) || /PerDay/i.test(q)),
    };
  } catch {
    return { message: `Gemini HTTP ${status}: ${text.replace(/\s+/g, " ").slice(0, 300)}`, hopeless: false };
  }
}

export function geminiClient(apiKey: string, model: string, fetchImpl: typeof fetch = fetch, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Generate {
  return async (req) => {
    for (let attempt = 1; ; attempt++) {
      const res = await fetchImpl(`${API}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(req),
      });
      if (res.ok) return (await res.json()) as GenerateResponse;
      const err = describeError(res.status, await res.text());
      // 429 — минуттық шек: Google-дың retryDelay-і (ең көбі 65 с), 4 әрекет. Шегі 0 не күндік квота — бірден қате.
      if (res.status === 429 && attempt < 4 && !err.hopeless) {
        await sleep(Math.min(err.retryMs ?? attempt * 5_000, 65_000));
        continue;
      }
      // 5xx — модель уақытша жүктелген («high demand»): 15, 30, 45, 60 с күтіп, 5 әрекет (~2,5 мин)
      if (res.status >= 500 && attempt < 5) {
        await sleep(attempt * 15_000);
        continue;
      }
      throw new Error(err.message);
    }
  };
}

export const textOf = (c?: Content) => (c?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join("\n").trim();
export const callsOf = (c?: Content) => (c?.parts ?? []).filter((p) => p.functionCall).map((p) => p.functionCall!);

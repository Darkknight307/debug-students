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

export function geminiClient(apiKey: string, model: string, fetchImpl: typeof fetch = fetch, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Generate {
  return async (req) => {
    for (let attempt = 1; ; attempt++) {
      const res = await fetchImpl(`${API}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(req),
      });
      if (res.ok) return (await res.json()) as GenerateResponse;
      const detail = (await res.text()).slice(0, 300);
      // 429/5xx — қысқа күтіп қайталау (тегін тарифтің минуттық шегі)
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await sleep(attempt * 5_000);
        continue;
      }
      throw new Error(`Gemini HTTP ${res.status}: ${detail}`);
    }
  };
}

export const textOf = (c?: Content) => (c?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join("\n").trim();
export const callsOf = (c?: Content) => (c?.parts ?? []).filter((p) => p.functionCall).map((p) => p.functionCall!);

import type { Api } from "./api";
import { httpApi } from "./http";
import { mockApi } from "./mock";

/**
 * Беттер тек осы `api`-ді қолданады. NEXT_PUBLIC_API_MODE=mock болса — бэкендсіз mockService
 * (npm run dev:mock), әйтпесе нақты /api/*. Мән build кезінде кіріктіріледі.
 */
export const API_MODE: "http" | "mock" = process.env.NEXT_PUBLIC_API_MODE === "mock" ? "mock" : "http";

export const api: Api = API_MODE === "mock" ? mockApi : httpApi;

export type { Api } from "./api";
export * from "./types";

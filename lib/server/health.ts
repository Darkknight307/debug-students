import { getStore, type Store } from "./store";
import { deployEnv, type DeployEnv } from "./otel";
import { log } from "./log";

export type Health = { ok: boolean; db: "up" | "down"; env: DeployEnv; version: string };

/**
 * Контейнер мен деплой тексерісі (#65): дерекқорға бір жеңіл сұраныс. Ішкі мәлімет (хост, қате мәтіні) шықпайды —
 * тек күй мен бейне нұсқасы (APP_VERSION = git SHA), CI жаңа нұсқа шынымен іске қосылғанын осыдан біледі.
 */
export async function checkHealth(store: () => Store = getStore, version = process.env.APP_VERSION || "dev"): Promise<{ status: 200 | 503; body: Health }> {
  try {
    await store().ping();
    return { status: 200, body: { ok: true, db: "up", env: deployEnv(), version } };
  } catch (e) {
    log("error", "health.db_down", { message: (e as Error).message.slice(0, 300) });
    return { status: 503, body: { ok: false, db: "down", env: deployEnv(), version } };
  }
}

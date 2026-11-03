import { getStore, type Store } from "./store";

export type Health = { ok: boolean; db: "up" | "down"; version: string };

/**
 * Контейнер мен деплой тексерісі (#65): дерекқорға бір жеңіл сұраныс. Ішкі мәлімет (хост, қате мәтіні) шықпайды —
 * тек күй мен бейне нұсқасы (APP_VERSION = git SHA), CI жаңа нұсқа шынымен іске қосылғанын осыдан біледі.
 */
export async function checkHealth(store: () => Store = getStore, version = process.env.APP_VERSION || "dev"): Promise<{ status: 200 | 503; body: Health }> {
  try {
    await store().ping();
    return { status: 200, body: { ok: true, db: "up", version } };
  } catch (e) {
    console.error("[health] db:", (e as Error).message);
    return { status: 503, body: { ok: false, db: "down", version } };
  }
}

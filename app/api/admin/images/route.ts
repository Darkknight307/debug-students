import crypto from "node:crypto";
import { adminRoute, json, HttpError } from "../../../../lib/server/route";
import { getStore } from "../../../../lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX = 2 * 1024 * 1024;

/** Trace суреті: шикі дене (Content-Type = сурет түрі), ≤ 2 МБ, дерекқорда сақталады. */
export const POST = adminRoute(async (req) => {
  const mime = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED.includes(mime)) throw new HttpError(415, "Тек сурет файлы (PNG, JPEG, GIF, WebP)");
  if (Number(req.headers.get("content-length") || 0) > MAX) throw new HttpError(413, "Сурет 2 МБ-тан аспауы керек");
  const data = new Uint8Array(await req.arrayBuffer());
  if (!data.length) throw new HttpError(400, "Бос файл");
  if (data.length > MAX) throw new HttpError(413, "Сурет 2 МБ-тан аспауы керек");
  const id = crypto.randomUUID();
  await getStore().addImage({ id, mime, data, created_at: new Date().toISOString() });
  return json({ url: `/api/images/${id}` });
});

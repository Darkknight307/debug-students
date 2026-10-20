import { getStore } from "../../../../lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Дерекқордағы Trace суреті. Атауы кездейсоқ UUID — болжау мүмкін емес; ұзақ кэш. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const img = /^[0-9a-f-]{36}$/i.test(id) ? await getStore().getImage(id) : null;
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(img.data), {
    headers: { "Content-Type": img.mime, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}

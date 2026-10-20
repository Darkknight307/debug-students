import { NextResponse } from "next/server";

export const noStore = { "Cache-Control": "no-store" };

export function fail(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status, headers: noStore });
}

export function ok(body: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...body }, { headers: noStore });
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  if (!(req.headers.get("content-type") || "").includes("application/json")) return null;
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

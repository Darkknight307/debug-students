import { NextResponse } from "next/server";
import { currentStudent } from "../../../../lib/currentStudent";
import { publicName } from "../../../../lib/publicName";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Басты бет «кіріп тұр ма?» дегенді осыдан біледі (cookie httpOnly болғандықтан JS оқи алмайды).
 * Кірмеген адамға дерекқорға бармай-ақ жауап береді.
 */
export async function GET() {
  const s = await currentStudent().catch(() => null);
  return NextResponse.json(s ? { loggedIn: true, name: publicName(s.full_name) } : { loggedIn: false }, {
    headers: { "Cache-Control": "no-store" },
  });
}

import { NextResponse } from "next/server";
import { currentStudent } from "../../../../lib/currentStudent";
import { maskEmail, maskPhone, publicName } from "../../../../lib/contest/logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * «Кіріп тұр ма?» және студенттің өз профилі (жасырылған email/телефон). cookie httpOnly болғандықтан
 * басты бет пен /me осыдан біледі. Кірмеген адамға дерекқорға бармай-ақ жауап береді.
 */
export async function GET() {
  const s = await currentStudent().catch(() => null);
  const body = s
    ? {
        loggedIn: true,
        name: publicName(s.full_name),
        profile: { fullName: s.full_name, university: s.university, course: s.course, emailMasked: maskEmail(s.email), phoneMasked: maskPhone(s.phone) },
      }
    : { loggedIn: false };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

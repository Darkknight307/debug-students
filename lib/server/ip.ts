import type { NextRequest } from "next/server";

/** Клиенттің IP-і (Vercel/прокси x-forwarded-for-ты өзі қояды). */
export function clientIp(req: NextRequest | Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

/** Хаттағы сілтемелердің негізі: NEXT_PUBLIC_SITE_URL, ол болмаса — сұраныстың өз мекенжайы. */
export function siteUrl(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/+$/, "");
}

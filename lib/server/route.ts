import { NextResponse, type NextRequest } from "next/server";
import { currentAdmin, isServerConfigured } from "./auth";
import { isConflict } from "./store";
import type { UserRow } from "./store";

/** Маршрут қатесі: статус + студентке/әкімшіге көрсетілетін хабар. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export const noStore = { "Cache-Control": "no-store" };
export const json = (body: Record<string, unknown>, status = 200) => NextResponse.json({ ok: status < 400, ...body }, { status, headers: noStore });

export async function body(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get("content-type") || "").includes("application/json")) throw new HttpError(415, "JSON күтілді");
  try {
    const b = await req.json();
    if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch {
    /* төменде */
  }
  throw new HttpError(400, "Сұраныс оқылмады");
}

function toResponse(e: unknown) {
  if (e instanceof HttpError) return json({ message: e.message, ...e.extra }, e.status);
  if (isConflict(e)) return json({ message: "Мұндай жазба бұрыннан бар" }, 409);
  console.error("[api]", (e as Error).message);
  return json({ message: "Сервер қатесі. Қайталап көріңіз." }, 500);
}

type Ctx<P> = { params: Promise<P> };

/** Әкімші маршруты: сессияны тексереді, қателерді HTTP жауапқа айналдырады. */
export function adminRoute<P = Record<string, string>>(fn: (req: NextRequest, admin: UserRow, params: P) => Promise<NextResponse>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      if (!isServerConfigured()) throw new HttpError(500, "Сервер әлі бапталмаған");
      const admin = await currentAdmin();
      if (!admin) throw new HttpError(401, "Әкімші ретінде кіріңіз");
      return await fn(req, admin, (await ctx?.params) as P);
    } catch (e) {
      return toResponse(e);
    }
  };
}

/** Кез келген маршрут: тек қателерді өңдейді. */
export function route<P = Record<string, string>>(fn: (req: NextRequest, params: P) => Promise<NextResponse>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      return await fn(req, (await ctx?.params) as P);
    } catch (e) {
      return toResponse(e);
    }
  };
}

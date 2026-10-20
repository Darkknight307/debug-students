import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./session";
import { supabaseAdmin, type StudentRow } from "./supabaseAdmin";

/**
 * Жарыс кезінде 500 оқушы бірнеше секунд сайын сұрайды — әр сұранысқа
 * students кестесіне бармас үшін жол инстанс ішінде 60 секунд сақталады.
 */
const TTL_MS = 60_000;
const rowCache = new Map<string, { at: number; row: StudentRow }>();

/** Server component / route handler ішінде ағымдағы оқушыны қайтарады, кірмесе null. */
export async function currentStudent(): Promise<StudentRow | null> {
  const store = await cookies();
  let claims = null;
  try {
    claims = verifySession(store.get(SESSION_COOKIE)?.value);
  } catch {
    return null; // SESSION_SECRET бапталмаған
  }
  if (!claims) return null;

  const hit = rowCache.get(claims.sid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.row;

  const { data, error } = await supabaseAdmin()
    .from("students")
    .select("id, auth_user_id, email, last_name, first_name, full_name, university, course, phone, first_login_at, last_login_at")
    .eq("id", claims.sid)
    .maybeSingle();
  if (error || !data) return null;
  if (rowCache.size > 5_000) rowCache.clear();
  rowCache.set(claims.sid, { at: Date.now(), row: data as StudentRow });
  return data as StudentRow;
}

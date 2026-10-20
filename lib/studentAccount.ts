import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabaseAdmin";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "./session";
import { fullNameOf, profileFromMetadata, type Profile } from "./registration";

/**
 * Supabase Auth қолданушысы → `students` жолы.
 * Жол тек email расталған соң құрылады (растау өшірулі болса — бірден тіркелгенде),
 * сондықтан басты беттегі қатысушылар тізімінде расталмаған адам болмайды.
 */

/** Дерекқорға жету мүмкін болмады (Supabase паузада, желі т.б.) — студентке ашық айтылады. */
export class StudentStoreError extends Error {
  unreachable: boolean;
  constructor(message: string) {
    super(message);
    this.unreachable = /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(message);
  }
}
/** Аккаунтта студент профилі жоқ (мысалы әкімшінің аккаунты). */
export class NotAStudentError extends Error {}

export type SavedStudent = { id: string; full_name: string };

/**
 * Кіргенде: бар жолдың last_login_at-ін жаңартады; жол жоқ болса (алғаш кіру) — профильден құрады.
 * `profile` берілмесе, тіркелгенде auth метадеректеріне жазылған профиль қолданылады.
 */
export async function saveStudent(user: User, profile?: Profile): Promise<SavedStudent> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();

  if (!profile) {
    const upd = await db.from("students").update({ last_login_at: now }).eq("auth_user_id", user.id).select("id, full_name");
    if (upd.error) throw new StudentStoreError(upd.error.message);
    if (upd.data?.length) return upd.data[0] as SavedStudent;
  }

  const p = profile ?? profileFromMetadata(user.user_metadata);
  if (!p) throw new NotAStudentError("auth user has no student profile");
  const { data, error } = await db
    .from("students")
    .upsert(
      {
        auth_user_id: user.id,
        email: (user.email ?? "").toLowerCase(),
        last_name: p.lastName,
        first_name: p.firstName,
        full_name: fullNameOf(p.lastName, p.firstName),
        university: p.university,
        course: p.course,
        phone: p.phone,
        last_login_at: now,
      },
      { onConflict: "auth_user_id" },
    )
    .select("id, full_name")
    .single();
  if (error || !data) throw new StudentStoreError(error?.message ?? "students upsert returned no row");
  return data as SavedStudent;
}

/** JSON жауапқа `debug_session` cookie-ін қосады. */
export function withSession(res: NextResponse, student: SavedStudent, authUserId: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, signSession(student.id, authUserId), sessionCookieOptions);
  return res;
}

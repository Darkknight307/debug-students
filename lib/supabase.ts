import { createClient } from "@supabase/supabase-js";

/**
 * Браузер клиенті: anon кілт + қолданушының JWT-і.
 * Барлық қорғаныс Postgres RLS-те: contests/rounds/tasks кестелеріне тек
 * `admins` тізіміндегі қолданушы жаза және оқи алады. Anon кілттің өзі
 * ешнәрсеге қолжетім бермейді.
 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } },
);

export type Contest = {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  status: "draft" | "published" | "running" | "finished";
  board_locked?: boolean;
  board_autolock_min?: number;
};

export type RoundKind = "mcq" | "debug" | "code";

export type Round = {
  id: string;
  contest_id: string;
  idx: number;
  kind: RoundKind;
  title: string;
  duration_min: number;
  status?: "pending" | "running" | "closed";
  started_at?: string | null;
  ends_at?: string | null;
};

export type McqOption = { key: string; text: string };
/** args — функцияға берілетін аргументтер (JSON), expected — эталон шешімнің repr нәтижесі */
export type TestCase = { args: unknown[]; expected: string };

export type Task = {
  id: string;
  round_id: string;
  idx: number;
  title: string;
  statement: string;
  points: number;
  options: McqOption[] | null;
  correct: string | null;
  starter_code: string | null;
  solution_code: string | null;
  variant: "A" | "B" | null;
  image_url: string | null;
  entry: string | null;
  max_changed_lines: number | null;
  forbidden: string[];
  /** ЖИ үлгі жауаптары («ЖИ талдауы» бетінде салыстыру үшін). 007_activity.sql орындалғанда ғана бар. */
  ai_refs?: string[];
  tests_public: TestCase[];
  tests_hidden: TestCase[];
};

export const KIND_LABEL: Record<RoundKind, string> = {
  mcq: "Trace — кодты оқу",
  debug: "Debug — қатені түзет",
  code: "Build — өзің жаз",
};

/** Кезең түріне қарай әдепкі ұпай (Apps Script-тегі pointsFor) */
export const DEFAULT_POINTS: Record<RoundKind, number> = { mcq: 1, debug: 3, code: 4 };

/**
 * Фронтенд пен бэкендтің ортақ DTO-лары (openapi.yml-дегі схемалармен бірдей).
 * Студентке арналған жауаптар — camelCase, әкімші жолдары — snake_case (бұрынғы JSON сақталды).
 */

export type Kind = "mcq" | "debug" | "code";
export type ContestStatus = "draft" | "published" | "running" | "finished";
export type RoundStatus = "pending" | "running" | "closed";
export type TestCase = { args: unknown[]; expected: string };
export type McqOption = { key: string; text: string };

export const KIND_LABEL: Record<Kind, string> = {
  mcq: "Trace — кодты оқу",
  debug: "Debug — қатені түзет",
  code: "Build — өзің жаз",
};

/** Кезең түріне қарай әдепкі ұпай */
export const DEFAULT_POINTS: Record<Kind, number> = { mcq: 1, debug: 3, code: 4 };

/* ---------------- жалпы ---------------- */

/** Студентке арналған шақырулардың нәтижесі: UI статус кодына қарай тармақталады (409, 422 …). */
export type ApiResult<T = Record<string, unknown>> = {
  status: number;
  data: T & { ok?: boolean; message?: string; field?: string };
};

/** Әкімші шақырулары қате болса лақтырады. */
export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(status: number, message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/* ---------------- студент: кіру ---------------- */

export type RegisterInput = {
  lastName: string;
  firstName: string;
  university: string;
  course: string;
  phone: string;
  email: string;
  password: string;
};

export type MeProfile = {
  fullName: string;
  university: string;
  course: string | null;
  emailMasked: string;
  phoneMasked: string;
};

export type Me = { loggedIn: false } | { loggedIn: true; name: string; profile: MeProfile };

export type AuthReply = { loggedIn?: boolean; needsConfirm?: boolean; unconfirmed?: boolean; sent?: boolean; student?: { fullName: string } };

/* ---------------- студент: жарыс ---------------- */

export type RoundInfo = {
  id: string;
  idx: number;
  kind: Kind;
  title: string;
  durationMin: number;
  state: "pending" | "open" | "closed";
  endsAt: string | null;
};

export type McqTask = {
  id: string;
  idx: number;
  title: string;
  statement: string;
  points: number;
  image_url: string | null;
  options: McqOption[];
};

export type CodeTask = {
  id: string;
  idx: number;
  title: string;
  statement: string;
  points: number;
  starter_code: string;
  entry: string;
  max_changed_lines: number | null;
  forbidden: string[];
  tests_public: TestCase[];
};

export type Mine = Record<string, { answer?: string; code?: string; verdict?: "correct" | "wrong" }>;

export type ActiveFull = {
  roundId: string;
  idx: number;
  kind: Kind;
  title: string;
  endsAt: string | null;
  variant: "A" | "B" | null;
  tasks: (McqTask | CodeTask)[];
  mine: Mine;
};

export type StateResponse = {
  ok: boolean;
  message?: string;
  serverNow: string;
  student: { fullName: string };
  contest: { id: string; title: string; status: string; startsAt: string } | null;
  rounds: RoundInfo[];
  active: { roundId: string; idx: number; kind: Kind } | ActiveFull | null;
  me: { rank: number | null; score: number; total: number } | null;
  boardLocked: boolean;
};

export type ChallengeReply = { token: string; inputs: unknown[][] };
export type SubmitInput = { taskId: string; token: string; code: string; outputs: string[] };
export type SubmitReply = { correct?: boolean; rejected?: boolean; reason?: string; changed?: number };

/* ---------------- ашық беттер ---------------- */

export type Landing = {
  ok: true;
  serverNow: string;
  contest: { title: string; startsAt: string; status: string } | null;
  students: { count: number; names: string[] };
};

export type BoardRow = { rank: number; name: string; score: number };
export type Board = {
  ok: boolean;
  locked: boolean;
  rows: BoardRow[];
  total: number;
  updated: string;
  stale?: boolean;
  idle?: boolean;
  note?: string;
};

/* ---------------- әкімші ---------------- */

export type AdminMe = { email: string };

export type AdminContest = {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  status: ContestStatus;
  board_locked: boolean;
  board_autolock_min: number;
};

export type AdminRound = {
  id: string;
  contest_id: string;
  idx: number;
  kind: Kind;
  title: string;
  duration_min: number;
  status: RoundStatus;
  started_at: string | null;
  ends_at: string | null;
};

export type AdminTask = {
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
  ai_refs: string[];
  tests_public: TestCase[];
  tests_hidden: TestCase[];
};

export type TaskInput = Omit<AdminTask, "id">;

export type ContestBundle = { contest: AdminContest; rounds: AdminRound[]; tasks: AdminTask[] };

export type AdminStats = { total: number; byUniversity: [string, number][] };

export type OperatorSummary = {
  submissions: number;
  people: number;
  extensions: { student_id: string; extra_min: number; name: string }[];
};

export type StudentHit = { id: string; full_name: string };

export type RankRow = {
  rank: number;
  student_id: string;
  name: string;
  score: number;
  last_correct_at: string | null;
  total: number;
};

export type RecheckSubmission = {
  id: number;
  student_id: string;
  task_id: string;
  code: string | null;
  is_correct: boolean;
  created_at: string;
};

export type AnalysisData = {
  title: string;
  rounds: { id: string; idx: number; kind: Kind; started_at: string | null; ends_at: string | null }[];
  tasks: AdminTask[];
  students: { id: string; full_name: string }[];
  subs: { id: number; student_id: string; task_id: string; code: string | null; is_correct: boolean; points: number; created_at: string }[];
  activity: { student_id: string; round_id: string; data: Record<string, unknown> }[];
};

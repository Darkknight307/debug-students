import type {
  AdminContest, AdminMe, AdminStats, AnalysisData, ApiResult, AuthReply, Board, ChallengeReply, ContestBundle,
  Landing, Me, OperatorSummary, RankRow, RecheckSubmission, RegisterInput, StateResponse, StudentHit,
  SubmitInput, SubmitReply, TaskInput, AdminTask,
} from "./types";

/**
 * Фронтенд пен бэкенд арасындағы жалғыз шекара. Екі іске асыруы бар:
 *   http.ts — нақты /api/* (әдепкі),  mock/ — бэкендсіз mockService (NEXT_PUBLIC_API_MODE=mock).
 * Студент шақырулары ApiResult қайтарады (ешқашан лақтырмайды), әкімші шақырулары ApiError лақтырады.
 */
export interface Api {
  mode: "http" | "mock";
  auth: {
    register(input: RegisterInput): Promise<ApiResult<AuthReply>>;
    login(email: string, password: string): Promise<ApiResult<AuthReply>>;
    logout(): Promise<void>;
    me(): Promise<Me>;
    forgot(email: string): Promise<ApiResult<AuthReply>>;
    resend(email: string): Promise<ApiResult<AuthReply>>;
    reset(tokenHash: string, password: string): Promise<ApiResult<AuthReply>>;
  };
  contest: {
    /** null — студент кірмеген (http режимінде /login-ға бағыттау басталды) */
    state(full: boolean): Promise<StateResponse | null>;
    answer(taskId: string, choice: string): Promise<ApiResult<{ saved?: boolean }>>;
    challenge(taskId: string): Promise<ApiResult<ChallengeReply>>;
    submit(input: SubmitInput): Promise<ApiResult<SubmitReply>>;
    /** beacon=true — бет жабылар алдында сенімді жеткізу */
    activity(body: string, beacon: boolean): Promise<boolean>;
  };
  public: {
    landing(): Promise<Landing | null>;
    board(): Promise<Board>;
  };
  admin: {
    me(): Promise<AdminMe | null>;
    login(email: string, password: string): Promise<AdminMe>;
    logout(): Promise<void>;
    stats(): Promise<AdminStats>;
    contests(): Promise<AdminContest[]>;
    createContest(input: { slug: string; title: string; starts_at: string }): Promise<AdminContest>;
    contest(id: string): Promise<ContestBundle>;
    updateContest(id: string, patch: Partial<Pick<AdminContest, "title" | "starts_at" | "status" | "board_locked" | "board_autolock_min">>): Promise<AdminContest>;
    startRound(roundId: string): Promise<void>;
    extendRound(roundId: string, minutes: number): Promise<void>;
    closeRound(roundId: string): Promise<void>;
    createTask(task: TaskInput): Promise<AdminTask>;
    updateTask(id: string, task: Partial<TaskInput>): Promise<AdminTask>;
    deleteTask(id: string): Promise<void>;
    uploadImage(file: File): Promise<{ url: string }>;
    operator(contestId: string): Promise<OperatorSummary>;
    searchStudents(q: string): Promise<StudentHit[]>;
    extendStudent(roundId: string, studentId: string): Promise<{ extra_min: number }>;
    ranking(contestId: string): Promise<RankRow[]>;
    recheckSubmissions(contestId: string, studentIds: string[], taskIds: string[]): Promise<RecheckSubmission[]>;
    analysis(contestId: string): Promise<AnalysisData>;
  };
}

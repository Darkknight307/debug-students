import type { Api } from "./api";
import { ApiError, type ApiResult, type StateResponse } from "./types";

/** Нақты бэкенд: /api/* (openapi.yml). */

const OFFLINE = "Интернет байланысы үзілді. Қайталап көріңіз.";

async function call<T>(method: string, url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const r = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({ ok: false, message: "Сервер жауап бермеді" }));
    return { status: r.status, data };
  } catch {
    return { status: 0, data: { ok: false, message: OFFLINE } as ApiResult<T>["data"] };
  }
}

/** Жарыс шақырулары: 401 келсе — кіру бетіне (бұрынғы мінез). */
async function student<T>(method: string, url: string, body?: unknown): Promise<ApiResult<T>> {
  const res = await call<T>(method, url, body);
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
  return res;
}

async function admin<T>(method: string, url: string, body?: unknown): Promise<T> {
  const { status, data } = await call<T>(method, url, body);
  if (status < 200 || status >= 300 || data.ok === false) throw new ApiError(status, data.message || `Қате ${status}`, data);
  return data as T;
}

const enc = encodeURIComponent;

export const httpApi: Api = {
  mode: "http",
  auth: {
    register: (input) => call("POST", "/api/auth/register", input),
    login: (email, password) => call("POST", "/api/auth/login", { email, password }),
    logout: async () => {
      await call("POST", "/api/auth/logout");
    },
    me: async () => {
      const { status, data } = await call<{ loggedIn: boolean }>("GET", "/api/auth/me");
      return status === 200 && data.loggedIn ? (data as never) : { loggedIn: false };
    },
    forgot: (email) => call("POST", "/api/auth/forgot", { email }),
    resend: (email) => call("POST", "/api/auth/resend", { email }),
    reset: (tokenHash, password) => call("POST", "/api/auth/reset", { tokenHash, password }),
  },
  contest: {
    state: async (full) => {
      const { status, data } = await student<StateResponse>("GET", `/api/contest/state${full ? "?full=1" : ""}`);
      if (status === 401) return null;
      if (!data.ok) throw new Error(data.message || "Сервер қатесі");
      return data as StateResponse;
    },
    answer: (taskId, choice) => student("POST", "/api/contest/answer", { taskId, choice }),
    challenge: (taskId) => student("POST", "/api/contest/challenge", { taskId }),
    submit: (input) => student("POST", "/api/contest/submit", input),
    activity: async (body, beacon) => {
      try {
        if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
          return navigator.sendBeacon("/api/contest/activity", new Blob([body], { type: "application/json" }));
        }
        const r = await fetch("/api/contest/activity", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
        return r.ok;
      } catch {
        return false;
      }
    },
  },
  public: {
    landing: async () => {
      const { status, data } = await call<never>("GET", "/api/public/landing");
      return status === 200 ? (data as never) : null;
    },
    board: async () => (await call<never>("GET", "/api/board")).data as never,
  },
  admin: {
    me: async () => {
      const { status, data } = await call<{ admin: { email: string } }>("GET", "/api/admin/auth/me");
      return status === 200 && data.admin ? data.admin : null;
    },
    login: async (email, password) => (await admin<{ admin: { email: string } }>("POST", "/api/admin/auth/login", { email, password })).admin,
    logout: async () => {
      await call("POST", "/api/admin/auth/logout");
    },
    stats: () => admin("GET", "/api/admin/stats"),
    contests: async () => (await admin<{ contests: never }>("GET", "/api/admin/contests")).contests,
    createContest: async (input) => (await admin<{ contest: never }>("POST", "/api/admin/contests", input)).contest,
    contest: (id) => admin("GET", `/api/admin/contests/${enc(id)}`),
    updateContest: async (id, patch) => (await admin<{ contest: never }>("PATCH", `/api/admin/contests/${enc(id)}`, patch)).contest,
    startRound: async (id) => {
      await admin("POST", `/api/admin/rounds/${enc(id)}/start`);
    },
    extendRound: async (id, minutes) => {
      await admin("POST", `/api/admin/rounds/${enc(id)}/extend`, { minutes });
    },
    closeRound: async (id) => {
      await admin("POST", `/api/admin/rounds/${enc(id)}/close`);
    },
    createTask: async (task) => (await admin<{ task: never }>("POST", "/api/admin/tasks", task)).task,
    updateTask: async (id, task) => (await admin<{ task: never }>("PATCH", `/api/admin/tasks/${enc(id)}`, task)).task,
    deleteTask: async (id) => {
      await admin("DELETE", `/api/admin/tasks/${enc(id)}`);
    },
    uploadImage: async (file) => {
      let r: Response;
      try {
        r = await fetch("/api/admin/images", { method: "POST", headers: { "content-type": file.type }, body: file });
      } catch {
        throw new ApiError(0, OFFLINE);
      }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new ApiError(r.status, data.message || `Қате ${r.status}`, data);
      return { url: data.url as string };
    },
    operator: (contestId) => admin("GET", `/api/admin/contests/${enc(contestId)}/operator`),
    searchStudents: async (q) => (await admin<{ students: never }>("GET", `/api/admin/students?q=${enc(q)}`)).students,
    extendStudent: (roundId, studentId) => admin("POST", `/api/admin/rounds/${enc(roundId)}/extensions`, { studentId }),
    ranking: async (contestId) => (await admin<{ rows: never }>("GET", `/api/admin/contests/${enc(contestId)}/ranking`)).rows,
    recheckSubmissions: async (contestId, studentIds, taskIds) =>
      (await admin<{ submissions: never }>("POST", `/api/admin/contests/${enc(contestId)}/submissions`, { studentIds, taskIds })).submissions,
    analysis: (contestId) => admin("GET", `/api/admin/contests/${enc(contestId)}/analysis`),
  },
};

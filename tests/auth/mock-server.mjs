// Жергілікті мок: Supabase Auth (/auth/v1/*) + Supabase REST (тек students кестесі).
// Нақты Supabase-ке ешқандай сұраныс жіберілмейді; барлық аккаунт — ойдан шығарылған фикстура.
// Хаттар жіберілмейді — «жіберілген» хаттың сілтемесі /__debug-та сақталады.
import crypto from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4455);
const SITE = process.env.MOCK_SITE || "http://127.0.0.1:3100";

const cfg = { confirm: false, dbDown: false }; // /__config арқылы ауысады
const users = new Map(); // email → { id, email, password, confirmed_at, user_metadata }
const tokens = new Map(); // token_hash → { email, type }
const sessions = new Map(); // access_token → email
const rows = new Map(); // auth_user_id → students жолы
const received = []; // students-ке жазылған өріс атаулары
const mails = []; // { to, kind, link }
const forwardedFor = []; // sb-forwarded-for тақырыбы
const apikeys = new Set();
let seq = 0;

// Студент профилі жоқ «әкімші» аккаунты — студенттің кіру бетінен кіре алмауы керек
users.set("admin@mock.test", { id: crypto.randomUUID(), email: "admin@mock.test", password: "admin-pass-123", confirmed_at: new Date().toISOString(), user_metadata: {} });

const send = (res, status, obj) => {
  res.writeHead(status, { "Content-Type": "application/json", "x-supabase-api-version": "2024-01-01" });
  res.end(obj === undefined ? "" : JSON.stringify(obj));
};
const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });

const userJson = (u) => ({
  id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
  email_confirmed_at: u.confirmed_at, confirmed_at: u.confirmed_at,
  user_metadata: u.user_metadata, app_metadata: { provider: "email" }, identities: [{ provider: "email" }],
  created_at: "2026-10-01T00:00:00Z",
});
function sessionFor(u) {
  const at = "AT-" + crypto.randomBytes(8).toString("hex");
  sessions.set(at, u.email);
  return { access_token: at, refresh_token: "RT-" + at, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: userJson(u) };
}
function mail(email, type) {
  const th = `${type}-${++seq}-${crypto.randomBytes(6).toString("hex")}`;
  tokens.set(th, { email, type });
  const link = type === "recovery" ? `${SITE}/auth/reset?token_hash=${th}&type=recovery` : `${SITE}/auth/confirm?token_hash=${th}&type=email`;
  mails.push({ to: email, kind: type, link });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://mock");
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (req.headers["sb-forwarded-for"]) forwardedFor.push(req.headers["sb-forwarded-for"]);
    if (req.headers.apikey) apikeys.add(req.headers.apikey);

    // ---------- Supabase Auth ----------
    if (req.method === "POST" && url.pathname === "/auth/v1/signup") {
      const email = String(body.email || "").toLowerCase();
      if (!body.password || body.password.length < 6) return send(res, 422, { code: "weak_password", msg: "Password should be at least 6 characters", weak_password: { reasons: ["length"] } });
      const prev = users.get(email);
      if (prev) {
        if (!cfg.confirm) return send(res, 422, { code: "user_already_exists", msg: "User already registered" });
        // Растау қосулы: нақты Supabase сияқты бұрмаланған жауап, хат жоқ (email бар-жоғы ашылмайды)
        return send(res, 200, { ...userJson({ ...prev, id: crypto.randomUUID() }), identities: [] });
      }
      const u = { id: crypto.randomUUID(), email, password: body.password, confirmed_at: cfg.confirm ? null : new Date().toISOString(), user_metadata: body.data || {} };
      users.set(email, u);
      if (!cfg.confirm) return send(res, 200, sessionFor(u));
      mail(email, "signup");
      return send(res, 200, userJson(u));
    }
    if (req.method === "POST" && url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      const u = users.get(String(body.email || "").toLowerCase());
      if (!u || u.password !== body.password) return send(res, 400, { code: "invalid_credentials", msg: "Invalid login credentials" });
      if (!u.confirmed_at) return send(res, 400, { code: "email_not_confirmed", msg: "Email not confirmed" });
      return send(res, 200, sessionFor(u));
    }
    if (req.method === "POST" && url.pathname === "/auth/v1/verify") {
      const t = tokens.get(body.token_hash);
      const typeOk = t && (body.type === "recovery" ? t.type === "recovery" : t.type === "signup");
      if (!typeOk) return send(res, 403, { code: "otp_expired", msg: "Email link is invalid or has expired" });
      tokens.delete(body.token_hash); // бір рет қана
      const u = users.get(t.email);
      u.confirmed_at ??= new Date().toISOString();
      return send(res, 200, sessionFor(u));
    }
    if (req.method === "POST" && url.pathname === "/auth/v1/resend") {
      const u = users.get(String(body.email || "").toLowerCase());
      if (u && !u.confirmed_at) mail(u.email, "signup");
      return send(res, 200, {});
    }
    if (req.method === "POST" && url.pathname === "/auth/v1/recover") {
      const u = users.get(String(body.email || "").toLowerCase());
      if (u) mail(u.email, "recovery");
      return send(res, 200, {});
    }
    if (url.pathname === "/auth/v1/user") {
      const email = sessions.get((req.headers.authorization || "").replace(/^Bearer /, ""));
      const u = email && users.get(email);
      if (!u) return send(res, 401, { code: "bad_jwt", msg: "invalid JWT" });
      if (req.method === "PUT") {
        if (body.password === u.password) return send(res, 422, { code: "same_password", msg: "New password should be different from the old password." });
        if (body.password) u.password = body.password;
      }
      return send(res, 200, userJson(u));
    }

    // ---------- Supabase REST: students ----------
    if (url.pathname === "/rest/v1/students") {
      if (cfg.dbDown) return req.socket.destroy(); // «fetch failed» — Supabase паузада тұрғандай
      const wantsObject = (req.headers.accept || "").includes("vnd.pgrst.object+json");
      const eq = (k) => (url.searchParams.get(k) || "").replace(/^eq\./, "");
      if (req.method === "POST") {
        received.push(Object.keys(body));
        const prev = rows.get(body.auth_user_id) || {};
        const row = { id: prev.id || crypto.randomUUID(), first_login_at: prev.first_login_at || new Date().toISOString(), ...prev, ...body };
        rows.set(body.auth_user_id, row);
        return send(res, 201, wantsObject ? row : [row]);
      }
      if (req.method === "PATCH") {
        received.push(Object.keys(body));
        const hit = [...rows.values()].filter((r) => r.auth_user_id === eq("auth_user_id"));
        hit.forEach((r) => Object.assign(r, body));
        return send(res, 200, hit);
      }
      if (req.method === "GET") {
        const found = [...rows.values()].filter((r) => !eq("id") || r.id === eq("id"));
        if (wantsObject) return found.length ? send(res, 200, found[0]) : send(res, 406, { code: "PGRST116", message: "no rows" });
        return send(res, 200, found);
      }
    }

    // ---------- тест басқаруы ----------
    if (url.pathname === "/__config") { Object.assign(cfg, body); return send(res, 200, cfg); }
    if (url.pathname === "/__debug") {
      return send(res, 200, { received, mails, forwardedFor, apikeys: [...apikeys], rows: [...rows.values()], users: [...users.values()].map((u) => ({ email: u.email, confirmed: !!u.confirmed_at, meta: u.user_metadata })) });
    }
    send(res, 404, { message: `mock: ${req.method} ${url.pathname}` });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`mock :${PORT}`));

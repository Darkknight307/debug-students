// Жергілікті мок: Supabase Auth (екі студент + әкімші) + PostgREST-тің DEBUG қолданатын бөлігі (жадта).
// Рейтинг SQL-дегі contest_ranking-пен бірдей ереже бойынша есептеледі
// (SQL-дің өзі уақытша Postgres-те бөлек тексерілді).
import crypto from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4466);
const db = { students: [], contests: [], rounds: [], tasks: [], round_extensions: [], contest_variants: [], submissions: [], admins: [{ user_id: "a0000000-0000-4000-8000-00000000000a" }], rank_snapshots: [], activity: [] };
const files = new Map(); // storage: task-images
let subSeq = 0;
const KEYS = { students: ["auth_user_id"], contest_variants: ["contest_id", "student_id"], round_extensions: ["round_id", "student_id"], activity: ["round_id", "student_id"] };

// Ойдан шығарылған аккаунттар (құпия сөзі бәрінде fixture-pass). Әкімшіде студент профилі жоқ.
const USERS = {
  "s1@mock.test": { id: "b1000000-0000-4000-8000-000000000001", user_metadata: { last_name: "Серіков", first_name: "Айдос", university: "Мок университеті", course: "2 курс", phone: "+77010000001" } },
  "s2@mock.test": { id: "b2000000-0000-4000-8000-000000000002", user_metadata: { last_name: "Қайрат", first_name: "Бота", university: "Мок колледжі", course: "1 курс", phone: null } },
  "admin@mock.test": { id: "a0000000-0000-4000-8000-00000000000a", user_metadata: {} },
};
const userOf = (email) => ({ ...USERS[email], aud: "authenticated", role: "authenticated", email, email_confirmed_at: "2026-10-01T00:00:00Z", app_metadata: {}, identities: [{}] });
const sessionOf = (email) => ({ access_token: "AT-" + email, refresh_token: "RT-" + email, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: userOf(email) });

const send = (res, status, obj) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(obj === undefined ? "" : JSON.stringify(obj));
};
const readBody = (req) => new Promise((r) => { const b = []; req.on("data", (c) => b.push(c)); req.on("end", () => r(Buffer.concat(b))); });

function parseIn(v) {
  return v.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
}
function applyFilters(rows, params) {
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[k]) === v.slice(3));
    else if (v.startsWith("in.")) { const set = new Set(parseIn(v.slice(3))); rows = rows.filter((r) => set.has(String(r[k]))); }
    else if (v === "is.null") rows = rows.filter((r) => r[k] == null);
    else if (v.startsWith("ilike.")) { const re = new RegExp("^" + v.slice(6).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i"); rows = rows.filter((r) => re.test(String(r[k] ?? ""))); }
    else throw new Error(`mock: filter ${k}=${v}`);
  }
  return rows;
}
function applyOrder(rows, order) {
  if (!order) return rows;
  const keys = order.split(",").map((o) => { const [c, d] = o.split("."); return [c, d === "desc" ? -1 : 1]; });
  return [...rows].sort((a, b) => {
    for (const [c, d] of keys) {
      if (a[c] === b[c]) continue;
      if (a[c] == null) return 1;
      if (b[c] == null) return -1;
      return (a[c] < b[c] ? -1 : 1) * d;
    }
    return 0;
  });
}

function ranking(contestId) {
  const last = new Map();
  const hidden = new Set(db.rounds.filter((r) => r.kind === "mcq" && r.status === "running").map((r) => r.id));
  const subs = applyOrder(db.submissions.filter((s) => s.contest_id === contestId && !hidden.has(s.round_id)), "created_at.asc,id.asc");
  for (const s of subs) last.set(`${s.task_id}:${s.student_id}`, s);
  const per = new Map();
  for (const s of last.values()) {
    const p = per.get(s.student_id) ?? { score: 0, last: null };
    if (s.is_correct) { p.score += s.points; if (!p.last || s.created_at > p.last) p.last = s.created_at; }
    per.set(s.student_id, p);
  }
  const name = (id) => db.students.find((x) => x.id === id)?.full_name ?? "?";
  const rows = [...per].map(([student_id, p]) => ({ student_id, name: name(student_id), score: p.score, last_correct_at: p.last }));
  rows.sort((a, b) => b.score - a.score || (a.last_correct_at ?? "~").localeCompare(b.last_correct_at ?? "~") || a.name.localeCompare(b.name));
  return rows.map((r, i) => ({ rank: i + 1, ...r, total: rows.length }));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://mock");
  const buf = await readBody(req);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,HEAD,OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range");
  if (req.method === "OPTIONS") return send(res, 204);
  try {
    // ---- Storage (әкімші суреттері) ----
    const up = url.pathname.match(/^\/storage\/v1\/object\/(?:public\/)?task-images\/(.+)$/);
    if (up && req.method === "POST") { files.set(up[1], { type: req.headers["content-type"], buf }); return send(res, 200, { Key: "task-images/" + up[1] }); }
    if (up && req.method === "GET") { const f = files.get(up[1]); if (!f) return send(res, 404, {}); res.writeHead(200, { "Content-Type": f.type }); return res.end(f.buf); }
    const body = buf.length ? JSON.parse(buf.toString("utf8")) : null;
    // ---- Supabase Auth (кіру; әкімші панелі де осы арқылы кіреді) ----
    if (req.method === "POST" && url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      if (body?.password === "fixture-pass" && USERS[body.email]) return send(res, 200, sessionOf(body.email));
      return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    }
    if (req.method === "POST" && url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      const email = String(body?.refresh_token || "").replace(/^RT-/, "");
      return USERS[email] ? send(res, 200, sessionOf(email)) : send(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
    }
    if (url.pathname === "/auth/v1/user") {
      const email = (req.headers.authorization || "").replace(/^Bearer AT-/, "");
      return USERS[email] ? send(res, 200, userOf(email)) : send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    }
    if (url.pathname === "/auth/v1/logout") return send(res, 204);

    // ---- тест басқаруы ----
    if (url.pathname === "/__seed") { for (const k of Object.keys(body)) db[k] = body[k]; return send(res, 200, { ok: true }); }
    if (url.pathname === "/__patch") { // {table, id, set}
      const r = db[body.table].find((x) => x.id === body.id); Object.assign(r, body.set); return send(res, 200, r);
    }
    if (url.pathname === "/__db") return send(res, 200, db);
    if (url.pathname === "/__rank") return send(res, 200, ranking(url.searchParams.get("c")));

    // ---- PostgREST ----
    if (url.pathname === "/rest/v1/rpc/contest_ranking" || url.pathname === "/rest/v1/rpc/admin_contest_ranking") return send(res, 200, ranking(body.p_contest));
    if (url.pathname === "/rest/v1/rpc/admin_unconfirmed_count") return send(res, 200, 0);
    const op = url.pathname.match(/^\/rest\/v1\/rpc\/admin_(start|extend|close)_round$/);
    if (op) {
      const r = db.rounds.find((x) => x.id === body.p_round);
      const now = Date.now();
      if (op[1] === "start") {
        for (const o of db.rounds) if (o.contest_id === r.contest_id && o.status === "running" && o !== r) Object.assign(o, { status: "closed", ends_at: new Date(Math.min(Date.parse(o.ends_at), now)).toISOString() });
        Object.assign(r, { status: "running", started_at: new Date(now).toISOString(), ends_at: new Date(now + r.duration_min * 60_000).toISOString() });
        const c = db.contests.find((x) => x.id === r.contest_id); if (["draft", "published"].includes(c.status)) c.status = "running";
      } else if (op[1] === "extend") {
        if (r.status !== "running") return send(res, 400, { message: "round is not running" });
        r.ends_at = new Date(Math.max(Date.parse(r.ends_at), now) + body.p_min * 60_000).toISOString();
      } else {
        if (r.status !== "running") return send(res, 400, { message: "round is not running" });
        Object.assign(r, { status: "closed", ends_at: new Date(Math.min(Date.parse(r.ends_at), now)).toISOString() });
      }
      return send(res, 200, r);
    }

    const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (m && db[m[1]]) {
      const table = m[1];
      const wantsObject = (req.headers.accept || "").includes("vnd.pgrst.object+json");
      if (req.method === "HEAD") {
        const n = applyFilters(db[table], url.searchParams).length;
        res.writeHead(200, { "Content-Range": n ? `0-${n - 1}/${n}` : "*/0" });
        return res.end();
      }
      if (req.method === "PATCH" || req.method === "DELETE") {
        const hit = applyFilters(db[table], url.searchParams);
        if (req.method === "PATCH") hit.forEach((r) => Object.assign(r, body));
        else db[table] = db[table].filter((r) => !hit.includes(r));
        if ((req.headers.prefer || "").includes("return=representation")) return send(res, 200, hit);
        return send(res, 204);
      }
      if (req.method === "GET") {
        let rows = applyOrder(applyFilters(db[table], url.searchParams), url.searchParams.get("order"));
        if ((url.searchParams.get("select") || "").includes("students(full_name)"))
          rows = rows.map((r) => ({ ...r, students: { full_name: db.students.find((x) => x.id === r.student_id)?.full_name } }));
        const off = Number(url.searchParams.get("offset") || 0);
        const lim = Number(url.searchParams.get("limit") || 0);
        if (off) rows = rows.slice(off);
        if (lim) rows = rows.slice(0, lim);
        if (wantsObject) return rows.length === 1 ? send(res, 200, rows[0]) : send(res, 406, { code: "PGRST116", message: `${rows.length} rows` });
        // count: "exact" сұралса, PostgREST жалпы санды Content-Range тақырыбында береді
        if ((req.headers.prefer || "").includes("count=exact")) {
          const all = applyFilters(db[table], url.searchParams).length;
          res.setHeader("Content-Range", rows.length ? `0-${rows.length - 1}/${all}` : `*/${all}`);
        }
        return send(res, 200, rows);
      }
      if (req.method === "POST") {
        const prefer = req.headers.prefer || "";
        const items = Array.isArray(body) ? body : [body];
        const out = [];
        for (const it of items) {
          const keys = (url.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
          const conflictKeys = keys.length ? keys : KEYS[table] ?? [];
          const prev = prefer.includes("resolution") && conflictKeys.length
            ? db[table].find((r) => conflictKeys.every((k) => r[k] === it[k])) : null;
          if (prev) {
            if (prefer.includes("ignore-duplicates")) continue;
            Object.assign(prev, it); out.push(prev); continue;
          }
          const row = { ...it };
          if (table === "submissions") row.id = ++subSeq;
          else row.id ??= crypto.randomUUID();
          row.created_at ??= new Date().toISOString();
          if (table === "students") row.first_login_at ??= row.created_at;
          db[table].push(row); out.push(row);
        }
        if (!prefer.includes("return=representation")) return send(res, 201);
        return send(res, 201, wantsObject ? out[0] : out);
      }
    }
    send(res, 404, { message: `mock: ${req.method} ${url.pathname}` });
  } catch (e) {
    send(res, 400, { message: String(e.message) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`mock-db :${PORT}`));

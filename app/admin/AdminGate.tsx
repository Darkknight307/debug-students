"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/client";

type State = "loading" | "anon" | "ok";

/** Әкімші панелінің кіруі: сайттың өз әкімші сессиясы (users.role = admin), api.admin.* арқылы. */
export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.admin.me().then((m) => setState(m ? "ok" : "anon")).catch(() => setState("anon"));
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await api.admin.login(email, password);
      setPassword("");
      setState("ok");
    } catch (err) {
      setMsg("! " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <div className="wrap" style={{ padding: "80px 0" }}><p className="tiny">тексерілуде…</p></div>;
  }

  if (state === "ok") return <>{children}</>;

  return (
    <div className="wrap" style={{ maxWidth: 460, padding: "clamp(60px,12vh,140px) var(--pad)" }}>
      <p className="kicker">Әкімші</p>
      <h1 className="h1" style={{ marginBottom: 26 }}>Панельге кіру</h1>
      <form className="card" onSubmit={signIn}>
        <div className="card-body">
          <div className="field">
            <label htmlFor="em">Email</label>
            <input id="em" type="email" value={email} autoComplete="username" onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="pw">Құпия сөз</label>
            <input id="pw" type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "кірілуде…" : "Кіру"}
          </button>
          <p className={"msg" + (msg ? " err" : "")} role="status" aria-live="polite">{msg}</p>
        </div>
      </form>
    </div>
  );
}

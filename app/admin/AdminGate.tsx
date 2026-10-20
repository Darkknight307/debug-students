"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type State = "loading" | "anon" | "notadmin" | "ok";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function check() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setState("anon");
    // RLS: әкімші емес қолданушы өз жолын да көрмейді
    const { data: row } = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", data.session.user.id)
      .maybeSingle();
    setState(row ? "ok" : "notadmin");
  }

  useEffect(() => {
    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg("! " + error.message);
  }

  if (state === "loading") {
    return <div className="wrap" style={{ padding: "80px 0" }}><p className="tiny">тексерілуде…</p></div>;
  }

  if (state === "ok") return <>{children}</>;

  return (
    <div className="wrap" style={{ maxWidth: 460, padding: "clamp(60px,12vh,140px) var(--pad)" }}>
      <p className="kicker">Әкімші</p>
      <h1 className="h1" style={{ marginBottom: 26 }}>
        {state === "notadmin" ? "Қолжетім жоқ" : "Панельге кіру"}
      </h1>

      {state === "notadmin" ? (
        <div className="card">
          <div className="card-body">
            <p className="muted" style={{ marginBottom: 18 }}>
              Бұл аккаунт әкімшілер тізімінде жоқ. Дұрыс аккаунтпен кіріңіз немесе
              әкімшіден өзіңізді қосуын сұраңыз.
            </p>
            <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>
              Шығу
            </button>
          </div>
        </div>
      ) : (
        <form className="card" onSubmit={signIn}>
          <div className="card-body">
            <div className="field">
              <label htmlFor="em">Email</label>
              <input
                id="em" type="email" value={email} autoComplete="username"
                onChange={(e) => setEmail(e.target.value)} required
              />
            </div>
            <div className="field">
              <label htmlFor="pw">Құпия сөз</label>
              <input
                id="pw" type="password" value={password} autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)} required
              />
            </div>
            <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
              {busy ? "кірілуде…" : "Кіру"}
            </button>
            <p className={"msg" + (msg ? " err" : "")} role="status" aria-live="polite">{msg}</p>
          </div>
        </form>
      )}
    </div>
  );
}

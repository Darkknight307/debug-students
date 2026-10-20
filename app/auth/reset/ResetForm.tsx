"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PASSWORD_MIN } from "../../../lib/registration";

export default function ResetForm({ tokenHash }: { tokenHash: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(false);
  const [shaking, setShaking] = useState(false);

  function error(text: string) {
    setMsg(text);
    setShaking(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password !== repeat) return error("Құпия сөздер сәйкес емес.");
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenHash, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; loggedIn?: boolean; message?: string; field?: string };
      if (res.ok && data.ok) {
        setPassword("");
        setRepeat("");
        if (data.loggedIn) {
          router.replace("/me");
          router.refresh();
          return;
        }
        setDone(true);
      } else {
        if (res.status === 400 && data.field !== "password") setExpired(true);
        error(data.message || "Құпия сөз сақталмады. Қайталап көріңіз.");
      }
    } catch {
      error("Байланыс жоқ. Интернетті тексеріп, қайталаңыз.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="card"><div className="card-body">
        <p className="ok-line"><span className="ok pop">✓</span> құпия сөз жаңартылды</p>
        <Link href="/login" className="btn" style={{ marginTop: 18 }}>Кіру</Link>
      </div></div>
    );
  }

  return (
    <form className={"card" + (shaking ? " shake" : "")} onSubmit={submit} onAnimationEnd={() => setShaking(false)}>
      <div className="card-body">
        <div className="field">
          <label htmlFor="np">Жаңа құпия сөз</label>
          <input id="np" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
            minLength={PASSWORD_MIN} maxLength={128} required />
          <p className="hint muted-hint">кемінде {PASSWORD_MIN} таңба</p>
        </div>
        <div className="field">
          <label htmlFor="rp">Қайталаңыз</label>
          <input id="rp" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password"
            minLength={PASSWORD_MIN} maxLength={128} required />
        </div>
        <button className={"btn" + (busy ? " is-busy" : "")} type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "сақталуда…" : "Сақтау"}
        </button>
        <p className={"msg" + (msg ? " err" : "")} role="status" aria-live="polite">{msg}</p>
        {expired && <Link href="/login?tab=forgot" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }}>Жаңа хат сұрау</Link>}
      </div>
    </form>
  );
}

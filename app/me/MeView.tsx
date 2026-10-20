"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type Me } from "../../lib/client";
import LogoutButton from "./LogoutButton";
import Decode from "../ui/Decode";

/** Студенттің беті: деректі api.auth.me()-ден алады (http және mock режимінде бірдей). */
export default function MeView() {
  const router = useRouter();
  const welcome = useSearchParams().get("welcome") === "1";
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api.auth.me().then((m) => (m.loggedIn ? setMe(m) : router.replace("/login")));
  }, [router]);

  if (!me || !me.loggedIn) return <div className="wrap" style={{ padding: "80px var(--pad)" }}><p className="tiny">жүктелуде…</p></div>;
  const p = me.profile;
  const rows: [string, string][] = [
    ["Оқу орны", p.university || "—"],
    ["Курс", p.course || "—"],
    ["Email", p.emailMasked],
    ["Телефон", p.phoneMasked],
  ];

  return (
    <div className="wrap" style={{ maxWidth: 720, padding: "clamp(48px,9vh,110px) var(--pad)" }}>
      <p className="kicker enter"><Decode text="Студент" /></p>
      <h1 className="h1 enter" style={{ ["--d" as string]: 1 }}>{p.fullName}</h1>
      <p className="tiny enter" style={{ marginTop: 10, ["--d" as string]: 2, color: welcome ? "var(--accent)" : undefined }}>
        {welcome ? "✓ тіркелдіңіз — қатысушылар тізіміне қосылдыңыз" : "тіркелген студент"}
      </p>

      <div className="card enter" style={{ marginTop: 28, ["--d" as string]: 3 }}>
        <div className="card-body">
          <dl style={{ display: "grid", gap: 14 }}>
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px" }}>
                <dt className="tiny" style={{ flex: "0 0 190px", paddingTop: 3 }}>{k}</dt>
                <dd style={{ margin: 0, color: "var(--title)" }}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="card enter" style={{ marginTop: 16, ["--d" as string]: 4 }}>
        <div className="card-body">
          <p className="muted">Жарыс басталғанда тапсырмалар жарыс бетінде өзі ашылады.</p>
          <Link href="/contest" className="btn" style={{ marginTop: 16 }}>Жарыс бетіне өту</Link>
        </div>
      </div>

      <div className="actions enter" style={{ marginTop: 24, ["--d" as string]: 5 }}>
        <Link href="/board" className="btn btn-ghost">Лидерборд</Link>
        <LogoutButton />
      </div>
    </div>
  );
}

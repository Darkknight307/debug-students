import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStudent } from "../../lib/currentStudent";
import LogoutButton from "./LogoutButton";
import Decode from "../ui/Decode";

export const dynamic = "force-dynamic";
export const metadata = { title: "DEBUG · Менің бетім" };

/** Экран бөліскенде нөмір толық көрінбесін: тек соңғы 4 цифр. */
function maskPhone(p: string | null): string {
  const d = (p || "").replace(/\D/g, "");
  if (d.length < 4) return "—";
  return `••• ••• ${d.slice(-4, -2)} ${d.slice(-2)}`;
}

/** Email-дің де тек басы мен домені: aidos.serikov@mail.kz → ai•••@mail.kz */
function maskEmail(e: string): string {
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  return `${e.slice(0, Math.min(2, at))}•••${e.slice(at)}`;
}

export default async function MePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await currentStudent().catch(() => null);
  if (!s) redirect("/login");
  const welcome = (await searchParams).welcome === "1";

  const rows: [string, string][] = [
    ["Оқу орны", s.university || "—"],
    ["Курс", s.course || "—"],
    ["Email", maskEmail(s.email)],
    ["Телефон", maskPhone(s.phone)],
  ];

  return (
    <div className="wrap" style={{ maxWidth: 720, padding: "clamp(48px,9vh,110px) var(--pad)" }}>
      <p className="kicker enter"><Decode text="Студент" /></p>
      <h1 className="h1 enter" style={{ ["--d" as string]: 1 }}>{s.full_name}</h1>
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

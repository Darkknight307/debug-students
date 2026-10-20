import Link from "next/link";
import ResetForm from "./ResetForm";
import Decode from "../../ui/Decode";

export const dynamic = "force-dynamic";
export const metadata = { title: "DEBUG · Жаңа құпия сөз" };

/**
 * Қалпына келтіру хатындағы сілтеме: /auth/reset?token_hash=…&type=recovery
 * Токен бетті ашқанда емес, «Сақтау» басылғанда серверде тексеріледі (/api/auth/reset).
 */
export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const tokenHash = typeof q.token_hash === "string" ? q.token_hash : "";
  const okType = q.type === undefined || q.type === "recovery";

  return (
    <div className="wrap" style={{ maxWidth: 480, padding: "clamp(56px,11vh,130px) var(--pad)" }}>
      <p className="kicker enter"><Decode text="DEBUG · СТУДЕНТТЕР" /></p>
      <h1 className="h1 enter" style={{ marginBottom: 14, ["--d" as string]: 1 }}>Жаңа құпия сөз</h1>
      {tokenHash && okType ? (
        <>
          <p className="muted enter" style={{ marginBottom: 26, lineHeight: 1.65, ["--d" as string]: 2 }}>
            Жаңа құпия сөз ойлап табыңыз — сақтаған соң бірден кіресіз.
          </p>
          <div className="enter" style={{ ["--d" as string]: 3 }}>
            <ResetForm tokenHash={tokenHash} />
          </div>
        </>
      ) : (
        <div className="card enter" style={{ ["--d" as string]: 2 }}>
          <div className="card-body">
            <p className="muted" style={{ lineHeight: 1.65 }}>Сілтеме толық емес. Хаттағы сілтемені қайта ашыңыз немесе жаңа хат сұраңыз.</p>
            <Link href="/login?tab=forgot" className="btn btn-ghost" style={{ marginTop: 18 }}>Жаңа хат сұрау</Link>
          </div>
        </div>
      )}
    </div>
  );
}

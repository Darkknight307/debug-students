import { redirect } from "next/navigation";
import { currentStudent } from "../../lib/currentStudent";
import { emailsEnabled } from "../../lib/server/mailer";
import AuthPanel, { type Tab } from "./AuthPanel";
import Decode from "../ui/Decode";

export const dynamic = "force-dynamic";
export const metadata = { title: "DEBUG · Кіру және тіркелу" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const student = await currentStudent().catch(() => null);
  if (student) redirect("/contest");

  const q = await searchParams;
  const one = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  const tab: Tab = one("tab") === "register" ? "register" : one("tab") === "forgot" ? "forgot" : "login";

  return (
    <div className="wrap" style={{ maxWidth: 560, padding: "clamp(56px,11vh,130px) var(--pad)" }}>
      <p className="kicker enter"><Decode text="DEBUG · СТУДЕНТТЕР" /></p>
      <AuthPanel initialTab={tab} emailsEnabled={emailsEnabled()} notice={null} />
    </div>
  );
}

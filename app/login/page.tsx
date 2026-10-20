import { redirect } from "next/navigation";
import { currentStudent } from "../../lib/currentStudent";
import { emailsEnabled } from "../../lib/supabaseAuth";
import AuthPanel, { type Tab } from "./AuthPanel";
import Decode from "../ui/Decode";

export const dynamic = "force-dynamic";
export const metadata = { title: "DEBUG · Кіру және тіркелу" };

// /auth/confirm пен /auth/reset осы бетке ?confirm=… / ?reset=… арқылы қайтарады
const NOTICES: Record<string, { text: string; err?: boolean }> = {
  "confirm:confirmed": { text: "Email расталды. Енді кіріңіз." },
  "confirm:expired": { text: "Растау сілтемесі жарамсыз немесе мерзімі өткен. Кіріп көріңіз — email расталмаған болса, хатты қайта жіберу батырмасы шығады.", err: true },
  "confirm:invalid": { text: "Растау сілтемесі толық емес. Хаттағы сілтемені қайта ашыңыз.", err: true },
  "confirm:server": { text: "Сервер уақытша жауап бермеді. Сілтемені сәл кейін қайта ашыңыз.", err: true },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const student = await currentStudent().catch(() => null);
  if (student) redirect("/contest");

  const q = await searchParams;
  const one = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  const tab: Tab = one("tab") === "register" ? "register" : one("tab") === "forgot" ? "forgot" : "login";
  const notice = NOTICES[`confirm:${one("confirm")}`] ?? null;

  return (
    <div className="wrap" style={{ maxWidth: 560, padding: "clamp(56px,11vh,130px) var(--pad)" }}>
      <p className="kicker enter"><Decode text="DEBUG · СТУДЕНТТЕР" /></p>
      <AuthPanel initialTab={tab} emailsEnabled={emailsEnabled()} notice={notice} />
    </div>
  );
}

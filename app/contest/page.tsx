import { redirect } from "next/navigation";
import { currentStudent } from "../../lib/currentStudent";
import ContestClient from "./ContestClient";
import "./contest.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "DEBUG · Жарыс" };

export default async function ContestPage() {
  const s = await currentStudent().catch(() => null);
  if (!s) redirect("/login?next=/contest");
  return <ContestClient />;
}

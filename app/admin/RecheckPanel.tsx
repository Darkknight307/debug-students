"use client";

import { useState } from "react";
import { supabase, type Round, type Task } from "../../lib/supabase";
import { normalizeAnswer } from "../../lib/contest/rules";
import { pyRunner } from "../../lib/contest/pyRunner";

type RankRow = { rank: number; student_id: string; name: string; score: number };
type Cell = { state: "ok" | "fail" | "none"; passed?: number; total?: number; error?: string };

/**
 * Жүлдегерлерді қайта тексеру. Жарыс кезінде «Жіберу» жасырын тесттердің кездейсоқ
 * бөлігін студент браузерінде тексереді; мұнда үздіктердің есептелген кодтары әкімшінің
 * браузерінде БАРЛЫҚ тесттерде қайта орындалады. Нәтиже тек есеп — ұпай өзгертілмейді.
 */
export default function RecheckPanel({ contestId, rounds, tasks }: { contestId: string; rounds: Round[]; tasks: Task[] }) {
  const [top, setTop] = useState(10);
  const [rows, setRows] = useState<RankRow[]>([]);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);

  const codeRounds = rounds.filter((r) => r.kind !== "mcq");
  const codeTasks = tasks.filter((t) => codeRounds.some((r) => r.id === t.round_id)).sort((a, b) => a.idx - b.idx);

  async function run() {
    setBusy(true);
    setCells({});
    setProgress("рейтинг алынуда…");
    try {
      const { data: rank, error } = await supabase.rpc("admin_contest_ranking", { p_contest: contestId });
      if (error) throw new Error(error.message);
      const leaders = ((rank ?? []) as RankRow[]).slice(0, top);
      setRows(leaders);
      if (!leaders.length || !codeTasks.length) return setProgress("тексеретін ештеңе жоқ");

      const { data: subs, error: e2 } = await supabase
        .from("submissions")
        .select("id, student_id, task_id, code, is_correct, created_at")
        .eq("contest_id", contestId)
        .in("student_id", leaders.map((l) => l.student_id))
        .in("task_id", codeTasks.map((t) => t.id))
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (e2) throw new Error(e2.message);

      const last = new Map<string, { code: string | null; is_correct: boolean }>();
      for (const s of subs ?? []) {
        const k = `${s.student_id}:${s.task_id}`;
        if (!last.has(k)) last.set(k, s);
      }

      let done = 0;
      const todo = leaders.length * codeTasks.length;
      for (const l of leaders) {
        for (const t of codeTasks) {
          const k = `${l.student_id}:${t.id}`;
          const s = last.get(k);
          let cell: Cell = { state: "none" };
          if (s?.is_correct && s.code) {
            const tests = [...(t.tests_public ?? []), ...(t.tests_hidden ?? [])];
            const out = await pyRunner().run(s.code, t.entry ?? "", tests.map((x) => x.args), 20_000);
            const passed = tests.filter((x, i) => normalizeAnswer(out.results[i]) === normalizeAnswer(x.expected)).length;
            cell = { state: passed === tests.length ? "ok" : "fail", passed, total: tests.length, error: out.error ?? undefined };
          }
          setCells((c) => ({ ...c, [k]: cell }));
          setProgress(`${++done}/${todo} тексерілді`);
        }
      }
      setProgress("✓ дайын");
    } catch (e) {
      setProgress("! " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 34 }}>
      <div className="card-head">
        <span>жүлдегерлерді қайта тексеру</span>
        <span>{progress}</span>
      </div>
      <div className="card-body stack" style={{ gap: 14 }}>
        <p className="muted">
          Үздіктердің есептелген Debug/Build кодтары барлық тесттерде (ашық + жасырын) қайта орындалады. Ұпай өзгермейді — бұл тек есеп.
        </p>
        <div className="actions">
          <select value={top} onChange={(e) => setTop(Number(e.target.value))} style={{ width: 120, minHeight: 46 }}>
            {[3, 10, 20, 50].map((n) => <option key={n} value={n}>үздік {n}</option>)}
          </select>
          <button className="btn" onClick={run} disabled={busy}>{busy ? "тексерілуде…" : "Қайта тексеру"}</button>
        </div>

        {rows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr className="tiny" style={{ textAlign: "left" }}>
                  <th style={{ padding: 8 }}>#</th>
                  <th style={{ padding: 8 }}>студент</th>
                  <th style={{ padding: 8 }}>ұпай</th>
                  {codeTasks.map((t) => <th key={t.id} style={{ padding: 8 }}>{t.idx}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student_id} style={{ borderTop: "1px solid var(--hairline-soft)" }}>
                    <td style={{ padding: 8, color: "var(--dim)" }}>{r.rank}</td>
                    <td style={{ padding: 8, color: "var(--title)" }}>{r.name}</td>
                    <td style={{ padding: 8 }}>{r.score}</td>
                    {codeTasks.map((t) => {
                      const c = cells[`${r.student_id}:${t.id}`];
                      return (
                        <td key={t.id} title={c?.error} style={{ padding: 8, whiteSpace: "nowrap", color: c?.state === "ok" ? "var(--accent)" : c?.state === "fail" ? "var(--err)" : "var(--dim)" }}>
                          {!c ? "…" : c.state === "ok" ? `✓ ${c.total}` : c.state === "fail" ? `✗ ${c.passed}/${c.total}` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="tiny" style={{ marginTop: 10, lineHeight: 1.8 }}>✓ — барлық тест өтті · ✗ — есептелген код толық тестте құлады · — есептелген жауап жоқ</p>
          </div>
        )}
      </div>
    </section>
  );
}

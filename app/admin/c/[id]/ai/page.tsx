"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../../lib/supabase";
import {
  LEVEL_HIGH, LEVEL_MEDIUM, analyze,
  type ActivityRow, type Level, type RoundLite, type StudentLite, type StudentReport, type SubLite, type TaskLite,
} from "../../../../../lib/analysis/analyze";
import { FEATURE_LABEL, type FeatureId } from "../../../../../lib/analysis/pycode";
import "./ai.css";

const LEVEL_LABEL: Record<Level, string> = { high: "жоғары", medium: "орташа", low: "төмен" };
const CONFIGURABLE: FeatureId[] = ["dictset", "compact", "helpers", "idioms", "tryexcept", "recursion", "classes"];
const LS_KEY = "debug:ai:untaught";
const PAGE = 1000; // PostgREST бір сұраныста ең көбі 1000 жол береді

/** Қазақстан уақыты (UTC+5), ЧЧ:ММ:СС */
function kzTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(Date.parse(iso) + 5 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
const mmss = (sec: number | null) => (sec === null ? "—" : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`);
const pct = (x: number) => Math.round(x * 100) + "%";

async function fetchAll<T>(run: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

type Loaded = { title: string; rounds: RoundLite[]; tasks: TaskLite[]; students: StudentLite[]; subs: SubLite[]; activity: ActivityRow[]; activityTable: boolean };

export default function AiAnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState("");
  // Студенттер сөздік пен жиынды біледі — әдепкіде ешбір тақырып «өтілмеген» деп белгіленбейді
  const [untaught, setUntaught] = useState<FeatureId[]>([]);
  const [filter, setFilter] = useState<Level | "all">("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (Array.isArray(saved)) setUntaught(saved.filter((x) => CONFIGURABLE.includes(x)));
    } catch {}
  }, []);
  function toggle(f: FeatureId) {
    setUntaught((cur) => {
      const next = cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f];
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const load = useCallback(async () => {
    setErr("");
    try {
      const c = await supabase.from("contests").select("title").eq("id", id).single();
      if (c.error) throw new Error(c.error.message);
      const r = await supabase.from("rounds").select("id, idx, kind, started_at, ends_at").eq("contest_id", id).order("idx");
      if (r.error) throw new Error(r.error.message);
      const rounds = (r.data ?? []) as RoundLite[];
      const t = await supabase.from("tasks").select("*").in("round_id", rounds.map((x) => x.id)).order("idx");
      if (t.error) throw new Error(t.error.message);
      const subs = await fetchAll<SubLite>((from, to) =>
        supabase.from("submissions").select("id, student_id, task_id, code, is_correct, points, created_at").eq("contest_id", id).order("id").range(from, to));
      const ids = [...new Set(subs.map((s) => s.student_id))];
      const students: StudentLite[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const s = await supabase.from("students").select("id, full_name").in("id", ids.slice(i, i + 100));
        if (s.error) throw new Error(s.error.message);
        students.push(...((s.data ?? []) as StudentLite[]));
      }
      // Бақылау кестесі 007_activity.sql орындалғанда ғана бар — жоқ болса, онсыз талдаймыз
      let activity: ActivityRow[] = [], activityTable = true;
      try {
        activity = await fetchAll<ActivityRow>((from, to) => supabase.from("activity").select("student_id, round_id, data").eq("contest_id", id).range(from, to));
      } catch {
        activityTable = false;
      }
      setData({ title: (c.data as { title: string }).title, rounds, tasks: (t.data ?? []) as TaskLite[], students, subs, activity, activityTable });
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const result = useMemo(() => (data ? analyze({ ...data, options: { untaught } }) : null), [data, untaught]);
  const rows = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLowerCase();
    return result.students.filter((s) => (filter === "all" || s.level === filter) && (!q || s.name.toLowerCase().includes(q)));
  }, [result, filter, query]);

  function exportCsv() {
    if (!result) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const taskIdx = [...new Set(result.students.flatMap((s) => s.tasks.map((t) => t.idx)))].sort((a, b) => a - b);
    const head = ["орын", "студент", "жалпы ұпай", "Trace", "Debug", "Build", "күдік деңгейі", "күдік ұпайы", "себептері",
      ...taskIdx.flatMap((i) => [`${i}: шешті`, `${i}: әрекет`, `${i}: уақыты`, `${i}: секунд`, `${i}: таңба/мин`, `${i}: бірдей құрылым`, `${i}: код`])];
    const lines = result.students.map((s) => [
      s.rank, s.name, s.total, s.byKind.mcq.got, s.byKind.debug.got, s.byKind.code.got, LEVEL_LABEL[s.level], s.score,
      s.reasons.map((r) => `${r.weight > 0 ? "+" : ""}${r.weight}${r.task ? ` [${r.task}]` : ""} ${r.text}`).join(" | "),
      ...taskIdx.flatMap((i) => {
        const t = s.tasks.find((x) => x.idx === i);
        return t ? [t.solved ? "иә" : "жоқ", t.attempts, kzTime(t.firstCorrectAt), t.seconds ?? "", t.cpm ?? "", t.structure ? t.structure.names.join(", ") : "", t.code ?? ""] : ["", "", "", "", "", "", ""];
      }),
    ].map(esc).join(","));
    const blob = new Blob(["﻿" + [head.map(esc).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "debug-ai-taldau.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (err) return <div className="wrap" style={{ padding: "80px var(--pad)" }}><p className="msg err">! {err}</p></div>;
  if (!data || !result) return <div className="wrap" style={{ padding: "80px var(--pad)" }}><p className="tiny">жүктелуде…</p></div>;

  const ov = result.overview;
  return (
    <div className="wrap ai" style={{ padding: "clamp(40px,7vh,84px) var(--pad)" }}>
      <Link href={`/admin/c/${id}`} className="tiny" style={{ display: "inline-block", marginBottom: 20 }}>← жарысқа қайту</Link>
      <p className="kicker">ЖИ талдауы · Build кезеңі</p>
      <h1 className="h1">{data.title}</h1>

      <div className="card ai-note">
        <div className="card-body">
          <p><b>Бұл үкім емес.</b> Қысқа стандартты шешімді студент өзі жазды ма, әлде ЖИ-дан не басқа студенттен алды ма — оны код бойынша сенімді анықтау мүмкін емес. Мұнда тек <b>белгілер</b> жиналған: әр студентке күдік деңгейі және оның нақты себептері. Күдік жоғары болса, студентпен жеке сөйлесіп, кодын түсіндіртіңіз — шешімді сол әңгіме бойынша шығарыңыз.</p>
        </div>
      </div>

      <div className="ai-stats">
        <div><b>{ov.buildParticipants}</b><span>Build-ке қатысты</span></div>
        <div><b>{ov.participants}</b><span>жарысқа қатысты</span></div>
        {Object.entries(ov.solvers).map(([idx, n]) => <div key={idx}><b>{n}</b><span>{idx}-тапсырманы шешті</span></div>)}
        <div className="lv high"><b>{ov.levels.high}</b><span>күдік жоғары</span></div>
        <div className="lv medium"><b>{ov.levels.medium}</b><span>күдік орташа</span></div>
        <div className="lv low"><b>{ov.levels.low}</b><span>күдік төмен</span></div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head"><span>баптау · студенттер әлі өтпеген тақырыптар</span><span>кодта кездессе — күдікке +3</span></div>
        <div className="card-body ai-checks">
          {CONFIGURABLE.map((f) => (
            <label key={f}><input type="checkbox" checked={untaught.includes(f)} onChange={() => toggle(f)} /> {FEATURE_LABEL[f]}</label>
          ))}
        </div>
      </div>

      {(!ov.hasActivity || !ov.hasAiRefs) && (
        <p className="tiny ai-hint">
          {!ov.hasActivity && (data.activityTable
            ? "Бұл жарыста бақылау дерегі жоқ (беттен шығу, қоюға тырысу, теру қарқыны) — ол келесі жарыстардан бастап жиналады. "
            : "Бақылау кестесі әлі жоқ: supabase/007_activity.sql файлын орындасаңыз, келесі жарыстарда беттен шығу мен теру қарқыны да есепке алынады. ")}
          {!ov.hasAiRefs && "Тапсырма редакторында «ЖИ үлгі жауабын» қоссаңыз, студент кодтары сонымен де салыстырылады."}
        </p>
      )}

      <div className="between" style={{ margin: "30px 0 14px" }}>
        <div className="actions">
          {(["all", "high", "medium", "low"] as const).map((f) => (
            <button key={f} className={"btn btn-sm " + (filter === f ? "" : "btn-ghost")} onClick={() => setFilter(f)}>
              {f === "all" ? `бәрі · ${result.students.length}` : `${LEVEL_LABEL[f]} · ${ov.levels[f]}`}
            </button>
          ))}
        </div>
        <div className="actions">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="аты-жөні…" style={{ width: 200, minHeight: 36, padding: "4px 12px", fontSize: 13 }} />
          <button className="btn btn-ghost btn-sm" onClick={exportCsv}>CSV жүктеу</button>
        </div>
      </div>

      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table className="ai-table">
            <thead>
              <tr><th>орын</th><th>студент</th><th>ұпай</th><th>T / D / B</th><th>күдік</th><th>негізгі себебі</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <Fragment key={s.studentId}>
                  <tr className={"lvrow " + s.level} onClick={() => setOpen(open === s.studentId ? null : s.studentId)}>
                    <td className="dim">{s.rank}</td>
                    <td className="name">{s.name}</td>
                    <td>{s.total}</td>
                    <td className="dim">{s.byKind.mcq.got} / {s.byKind.debug.got} / {s.byKind.code.got}</td>
                    <td><span className={"badge " + s.level}>{LEVEL_LABEL[s.level]} · {s.score}</span></td>
                    <td className="why">{s.reasons.find((r) => r.weight > 0)?.text ?? "белгі табылмады"}</td>
                    <td className="dim">{open === s.studentId ? "▲" : "▼"}</td>
                  </tr>
                  {open === s.studentId && <tr className="detail"><td colSpan={7}><Detail s={s} /></td></tr>}
                </Fragment>
              ))}
              {!rows.length && <tr><td colSpan={7} className="dim" style={{ padding: 24 }}>Сәйкес студент жоқ.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="h2" style={{ margin: "44px 0 6px" }}>Бірдей кодтар</h2>
      <p className="muted" style={{ marginBottom: 16 }}>
        Бос орын мен түсініктемелер еленбейді. «Құрылымы бірдей» — айнымалы атаулары ғана басқа. Топ ішінде студенттер жіберген ретімен тұр.
      </p>
      {result.clusters.length === 0 && <p className="tiny">Екі не одан көп студентте бірдей шыққан код жоқ.</p>}
      <div className="stack" style={{ gap: 12 }}>
        {result.clusters.map((c, i) => (
          <details key={i} className="card ai-cluster">
            <summary>
              <span className={"badge " + (c.common ? "low" : c.kind === "exact" ? "high" : "medium")}>
                {c.kind === "exact" ? "атауларына дейін бірдей" : "құрылымы бірдей"}{c.common ? " · стандартты шешім" : ""}
              </span>
              <b>{c.taskIdx} · {c.taskTitle}</b>
              <span className="dim">{c.members.length} студент</span>
            </summary>
            <div className="card-body">
              <p className="members">{c.members.map((m) => `${m.name} (${kzTime(m.at)})`).join("  →  ")}</p>
              <pre className="code">{c.code}</pre>
            </div>
          </details>
        ))}
      </div>

      <details className="card ai-method" style={{ marginTop: 44 }}>
        <summary><b>Күдік ұпайы қалай есептеледі</b></summary>
        <div className="card-body">
          <p>Әр белгі ұпай қосады, қорғайтын белгілер азайтады. Қосынды {LEVEL_HIGH} және одан жоғары болса — «жоғары», {LEVEL_MEDIUM}-тен бастап — «орташа».</p>
          <ul>
            <li><b>+5</b> — коды басқа студентпен атауларына дейін бірдей (бірінші жібергенге +2)</li>
            <li><b>+3</b> — құрылымы басқа студентпен бірдей, тек атаулары басқа (бірінші жібергенге +1). Сол құрылым көп студентте кездессе — стандартты шешім, +0.5</li>
            <li><b>+1.5</b> — ертерек жіберген студенттің кодына 96%-дан жоғары ұқсас</li>
            <li><b>+3</b> — әлі өтілмеген тақырып қолданылған (жоғарыдағы баптау бойынша)</li>
            <li><b>+3 / +1.5</b> — қолда болған уақытқа шаққанда тым жылдам терген (240 / 160 таңба/мин-тан жоғары)</li>
            <li><b>+2 / +1</b> — Build-ті толық шешкен, бірақ Trace пен Debug нәтижесі төмен</li>
            <li><b>+4 / +2</b> — ЖИ үлгі жауабымен дәл бірдей / құрылымы бірдей (үлгі қосылса)</li>
            <li><b>+1</b> — docstring не тип аннотациясы бар</li>
            <li><b>+2…+3</b> — Build кезінде беттен жиі не ұзақ шыққан; қоюға (paste) тырысқан <span className="dim">(бақылау дерегі болса)</span></li>
            <li><b>+1.5</b> — кодты түзетусіз және кідіріссіз терген <span className="dim">(бақылау дерегі болса)</span></li>
            <li><b>−1</b> — қате нұсқасын біртіндеп түзетіп шешкен; <b>−0.5</b> — «Тексеру»-де қате шығып, түзеткен</li>
          </ul>
          <p className="dim">Тым қысқа код (30 таңбалық бірліктен аз) кездейсоқ сәйкес келе береді, сондықтан ондай сәйкестік есепке алынбайды. Бақылау дерегі студенттің браузерінде жиналады, оны техникалық сауатты студент бұрмалай алады.</p>
        </div>
      </details>
    </div>
  );
}

function Detail({ s }: { s: StudentReport }) {
  return (
    <div className="ai-detail">
      <div className="reasons">
        {s.reasons.length === 0 && <p className="dim">Ешқандай белгі табылмады.</p>}
        {s.reasons.map((r, i) => (
          <p key={i} className={r.weight < 0 ? "minus" : ""}>
            <b>{r.weight > 0 ? "+" : ""}{r.weight}</b>
            {r.task ? <i>{r.task}-тапсырма</i> : <i>жалпы</i>}
            <span>{r.text}</span>
          </p>
        ))}
        {s.away && (
          <p className="dim">Build кезінде: қойындыдан {s.away.hidden_count} рет шыққан ({Math.round(s.away.hidden_ms / 1000)} с), терезе {s.away.blur_count} рет белсенді болмаған ({Math.round(s.away.blur_ms / 1000)} с).</p>
        )}
      </div>
      <div className="tasks">
        {s.tasks.map((t) => (
          <div key={t.taskId} className="task">
            <p className="thead">
              <b>{t.idx} · {t.title}</b>
              <span className={"badge " + (t.solved ? "ok" : "low")}>{t.solved ? "шешті" : t.attempts ? "шешпеді" : "жібермеді"}</span>
            </p>
            {t.attempts > 0 && (
              <p className="meta">
                әрекет: {t.attempts}{t.failedBefore > 0 && t.solved ? ` (алдымен ${t.failedBefore} қате)` : ""}
                {t.solved && <> · жіберді: {kzTime(t.firstCorrectAt)} · қолда болған уақыт: {mmss(t.seconds)} · терілген: {t.typed} таңба{t.cpm !== null ? ` · ${t.cpm} таңба/мин` : ""}</>}
              </p>
            )}
            {t.features.length > 0 && <p className="meta">қолданған: {t.features.map((f) => FEATURE_LABEL[f]).join("; ")}</p>}
            {t.exact && <p className="meta hot">атауларына дейін бірдей: {t.exact.names.join(", ")} ({t.exact.order}-ші болып жіберген)</p>}
            {t.structure && !t.exact && <p className={"meta " + (t.structure.common ? "" : "hot")}>құрылымы бірдей: {t.structure.names.join(", ")} ({t.structure.order}-ші болып жіберген){t.structure.common ? " — стандартты шешім" : ""}</p>}
            {t.nearest.length > 0 && <p className="meta">ұқсас кодтар: {t.nearest.map((n) => `${n.name} ${pct(n.sim)}${n.earlier ? " (ертерек)" : ""}`).join(", ")}</p>}
            {t.aiRef && <p className={"meta " + (t.aiRef.sim >= 0.999 ? "hot" : "")}>ЖИ үлгісіне ұқсастығы: {pct(t.aiRef.sim)}{t.aiRef.exact ? " — атауларына дейін бірдей" : ""}</p>}
            {t.activity && (
              <p className="meta">теру: {t.activity.keys ?? 0} таңба, өшірген {t.activity.dels ?? 0}, ұзақ кідіріс {t.activity.pauses ?? 0}, ойлану {t.activity.think_ms != null ? Math.round(t.activity.think_ms / 1000) + " с" : "—"} · «Тексеру»: {t.activity.checks ?? 0} (қатесі {t.activity.check_fails ?? 0}) · қоюға тырысу: {t.activity.blocked ?? 0}</p>
            )}
            {t.code ? <pre className="code">{t.code}</pre> : <p className="dim">код жоқ</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

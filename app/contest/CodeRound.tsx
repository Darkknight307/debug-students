"use client";

import { useEffect, useMemo, useState } from "react";
import CodeEditor from "./CodeEditor";
import Rich from "./Rich";
import { changedLines, checkCode } from "../../lib/contest/rules";
import { pyRunner } from "../../lib/contest/pyRunner";
import type { Telemetry } from "../../lib/contest/telemetry";
import { postJson, pyRepr, type CodeTask, type Kind, type Mine } from "./types";

type CheckRow = { call: string; expected: string; got: string; pass: boolean };
type Panel =
  | { type: "check"; rows: CheckRow[]; stdout: string; error: string | null }
  | { type: "verdict"; correct: boolean; points: number }
  | { type: "msg"; text: string; tone: "err" | "warn" }
  | null;

const norm = (v: string) => v.replace(/\s+/g, "").replace(/'/g, '"').toLowerCase();

function draftKey(taskId: string) {
  return `debug:draft:${taskId}`;
}
function readDraft(taskId: string): string | null {
  try {
    return localStorage.getItem(draftKey(taskId));
  } catch {
    return null;
  }
}
function writeDraft(taskId: string, code: string) {
  try {
    localStorage.setItem(draftKey(taskId), code);
  } catch {}
}

/** Debug және Build: редактор, «Тексеру» (ашық мысалдар), «Жіберу» (жасырын тесттер). */
export default function CodeRound({
  kind, tasks, mine, locked, onVerdict, telemetry,
}: {
  kind: Exclude<Kind, "mcq">;
  tasks: CodeTask[];
  mine: Mine;
  locked: boolean;
  onVerdict: (taskId: string, correct: boolean) => void;
  telemetry?: Telemetry | null;
}) {
  const [sel, setSel] = useState(tasks[0]?.id ?? "");
  const task = tasks.find((t) => t.id === sel) ?? tasks[0];
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [panels, setPanels] = useState<Record<string, Panel>>({});
  const [busy, setBusy] = useState<"" | "check" | "submit">("");
  const [panelSeq, setPanelSeq] = useState(0); // жаңа нәтиже — жаңа анимация
  const [clipNote, setClipNote] = useState(0); // көшіру/қою әрекеті бұғатталған сайын ескерту жыпылықтайды
  const [py, setPy] = useState<string>("idle");

  useEffect(() => pyRunner().onStatus(setPy), []);
  // Тапсырма ашылған сәт тіркеледі («ойлану уақыты» осыдан есептеледі)
  useEffect(() => {
    if (task) telemetry?.open(task.id);
  }, [task, telemetry]);
  useEffect(() => {
    pyRunner().load().catch(() => {});
  }, []);

  // Бастапқы код: браузердегі жоба → соңғы жіберілім → тапсырма шаблоны
  useEffect(() => {
    setCodes((prev) => {
      const next = { ...prev };
      for (const t of tasks) if (next[t.id] === undefined) next[t.id] = readDraft(t.id) ?? mine[t.id]?.code ?? t.starter_code;
      return next;
    });
  }, [tasks, mine]);

  const code = task ? codes[task.id] ?? task.starter_code : "";
  const changed = useMemo(() => (task && kind === "debug" ? changedLines(task.starter_code, code) : 0), [task, code, kind]);
  const maxLines = task?.max_changed_lines ?? 1;
  const panel = task ? panels[task.id] ?? null : null;

  if (!task) return <p className="muted">Бұл кезеңде тапсырма жоқ.</p>;

  function setCode(v: string) {
    setCodes((c) => ({ ...c, [task.id]: v }));
    writeDraft(task.id, v);
  }
  const setPanel = (p: Panel) => {
    setPanelSeq((n) => n + 1);
    setPanels((s) => ({ ...s, [task.id]: p }));
  };

  async function check() {
    setBusy("check");
    setPanel(null);
    try {
      const tests = task.tests_public;
      if (!tests.length) {
        setPanel({ type: "msg", tone: "warn", text: "Бұл тапсырмада ашық мысал жоқ — бірден «Жіберу» басыңыз." });
        return;
      }
      const out = await pyRunner().run(code, task.entry, tests.map((t) => t.args));
      const rows = tests.map((t, k) => ({
        call: `${task.entry}(${t.args.map(pyRepr).join(", ")})`,
        expected: t.expected,
        got: out.results[k] ?? "",
        pass: norm(out.results[k] ?? "") === norm(t.expected),
      }));
      telemetry?.check(task.id, rows.some((r) => !r.pass));
      setPanel({ type: "check", stdout: out.stdout, error: out.error, rows });
    } catch (e) {
      setPanel({ type: "msg", tone: "err", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  async function submit() {
    const rules = checkCode({ kind, starter_code: task.starter_code, max_changed_lines: task.max_changed_lines, forbidden: task.forbidden }, code);
    if (!rules.ok) return setPanel({ type: "msg", tone: "warn", text: rules.message });

    setBusy("submit");
    setPanel(null);
    try {
      const ch = await postJson<{ token: string; inputs: unknown[][] }>("/api/contest/challenge", { taskId: task.id });
      if (!ch.data.ok) return setPanel({ type: "msg", tone: "err", text: ch.data.message || "Қате" });

      const out = await pyRunner().run(code, task.entry, ch.data.inputs, 8_000);
      const outputs = out.results.map((r) => String(r).slice(0, 2000));
      const sub = await postJson<{ correct: boolean }>("/api/contest/submit", { taskId: task.id, token: ch.data.token, code, outputs });
      if (!sub.data.ok) return setPanel({ type: "msg", tone: sub.status === 422 ? "warn" : "err", text: sub.data.message || "Қате" });

      setPanel({ type: "verdict", correct: sub.data.correct, points: task.points });
      onVerdict(task.id, sub.data.correct);
      telemetry?.flush();
    } catch (e) {
      setPanel({ type: "msg", tone: "err", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  function resetCode() {
    if (!confirm("Кодты бастапқы күйге қайтарасыз ба? Өзгерістеріңіз өшеді.")) return;
    setCode(task.starter_code);
    setPanel(null);
  }

  const pyLabel = py === "ready" ? "Python дайын" : py === "failed" ? "Python жүктелмеді" : "Python жүктелуде…";

  return (
    <div className="stack" style={{ gap: 16 }}>
      <nav className="qnav" aria-label="Тапсырмалар">
        {tasks.map((t) => {
          const v = mine[t.id]?.verdict;
          return (
            <button key={t.id} type="button" onClick={() => setSel(t.id)}
                    className={"qchip wide" + (t.id === task.id ? " cur" : "") + (v === "correct" ? " ok" : v === "wrong" ? " bad" : "")}>
              {t.idx}
              <i>{v === "correct" ? "✓" : v === "wrong" ? "✗" : "·"}</i>
            </button>
          );
        })}
        <span className={"qcount py " + py}>{pyLabel}</span>
      </nav>

      <article className="card">
        <div className="card-head">
          <span>{String(task.idx).padStart(2, "0")} · {task.title}</span>
          <span>{task.points} ұпай</span>
        </div>
        <div className="card-body stack" style={{ gap: 14 }}>
          <Rich text={task.statement} />
          <div className="rules">
            <span className="pill">функция: {task.entry}()</span>
            {kind === "debug" && <span className="pill running">тек {maxLines} жолды өзгертуге болады</span>}
            {task.forbidden.map((f) => (
              <span key={f} className="pill" style={{ color: "var(--err)", borderColor: "rgba(255,92,122,.35)" }}>тыйым: {f}</span>
            ))}
          </div>

          <CodeEditor value={code} onChange={setCode} readOnly={locked} noClipboard
                      onClipboardBlocked={() => { setClipNote((n) => n + 1); telemetry?.blocked(task.id); }}
                      onEdit={(ins, del) => telemetry?.edit(task.id, ins, del)} />
          <p key={clipNote} className={"clip-note" + (clipNote ? " hit" : "")}>
            Бұл кезеңде көшіру мен қою (copy / paste) өшірілген — кодты өзің тер.
          </p>

          <div className="between">
            {kind === "debug" ? (
              <span className={"counter" + (changed > maxLines ? " over" : changed ? " on" : "")}>
                өзгерген жол: {changed} / {maxLines}
              </span>
            ) : <span />}
            <div className="actions">
              <button className="btn btn-ghost btn-sm" type="button" onClick={resetCode} disabled={locked || !!busy}>
                бастапқы код
              </button>
              <button className="btn btn-ghost" type="button" onClick={check} disabled={locked || !!busy}>
                {busy === "check" ? "тексеруде…" : "Тексеру"}
              </button>
              <button className="btn" type="button" onClick={submit} disabled={locked || !!busy}>
                {busy === "submit" ? "жіберілуде…" : "Жіберу"}
              </button>
            </div>
          </div>

          {panel?.type === "verdict" && (
            <div key={panelSeq} className={"verdict " + (panel.correct ? "ok" : "bad")}>
              {panel.correct
                ? <><b>✓ Дұрыс</b><span>{panel.points} ұпай есептелді</span></>
                : <><b>✗ Қате</b><span>Жасырын тесттердің кейбірі өтпеді. Кодты тексеріп, қайта жіберіңіз.</span></>}
            </div>
          )}
          {panel?.type === "msg" && <p key={panelSeq} className={"verdict " + (panel.tone === "err" ? "bad" : "warn")}><span>{panel.text}</span></p>}
          {panel?.type === "check" && (
            <div className="checks">
              <p className="tiny">ашық мысалдар · {panel.rows.filter((r) => r.pass).length}/{panel.rows.length} өтті</p>
              {panel.rows.map((r, k) => (
                <div key={`${panelSeq}-${k}`} className={"check " + (r.pass ? "ok" : "bad")} style={{ ["--d" as string]: k }}>
                  <code className="call">{r.call}</code>
                  <span className="exp">күтілген: <code>{r.expected}</code></span>
                  <span className="got">сенікі: <code>{r.got}</code></span>
                </div>
              ))}
              {panel.stdout && <pre className="stdout">{panel.stdout}</pre>}
              <p className="tiny" style={{ lineHeight: 1.7 }}>Мысалдар өтсе де, «Жіберу» жасырын тесттермен тексереді</p>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

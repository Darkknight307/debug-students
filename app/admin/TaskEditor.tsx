"use client";

import { useState } from "react";
import { api, DEFAULT_POINTS, type Kind as RoundKind, type AdminTask as Task, type TestCase } from "../../lib/client";
import { changedLines } from "../../lib/contest/rules";
import { pyRunner } from "../../lib/contest/pyRunner";

type Draft = Omit<Task, "id" | "round_id">;

/** Тесттер әкімшіге жол-жолымен көрсетіледі: әр жол — аргументтердің JSON тізімі. */
const argsToText = (tests: TestCase[]) => tests.map((t) => JSON.stringify(t.args)).join("\n");

function parseArgs(text: string): { ok: true; list: unknown[][] } | { ok: false; line: number; error: string } {
  const list: unknown[][] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim();
    if (!s) continue;
    try {
      const v = JSON.parse(s);
      if (!Array.isArray(v)) return { ok: false, line: i + 1, error: "аргументтер тізім болуы керек, мысалы [[1, 2]] немесе [5, \"a\"]" };
      list.push(v);
    } catch {
      return { ok: false, line: i + 1, error: "JSON қате (жолдар \"қос тырнақшада\", True → true, None → null)" };
    }
  }
  return { ok: true, list };
}

const guessEntry = (code: string | null) => /^\s*def\s+([A-Za-z_]\w*)\s*\(/m.exec(code ?? "")?.[1] ?? "";

export function emptyDraft(kind: RoundKind, idx: number): Draft {
  const d: Draft = {
    idx, title: "", statement: "", points: DEFAULT_POINTS[kind],
    options: null, correct: null, starter_code: null, solution_code: null,
    variant: null, image_url: null, entry: null, max_changed_lines: null,
    forbidden: [], ai_refs: [], tests_public: [], tests_hidden: [],
  };
  if (kind === "mcq") {
    d.options = [
      { key: "a", text: "" }, { key: "b", text: "" },
      { key: "c", text: "" }, { key: "d", text: "" },
    ];
    d.correct = "a";
  } else {
    d.starter_code = "";
    d.solution_code = "";
    if (kind === "debug") d.max_changed_lines = 1;
  }
  return d;
}

export default function TaskEditor({
  kind, roundId, task, nextIdx, onDone, onCancel,
}: {
  kind: RoundKind;
  roundId: string;
  task: Task | null;
  nextIdx: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(() => {
    if (!task) return emptyDraft(kind, nextIdx);
    const { id: _id, round_id: _r, ...rest } = task;
    return { ...emptyDraft(kind, task.idx), ...rest, forbidden: task.forbidden ?? [], tests_public: task.tests_public ?? [], tests_hidden: task.tests_hidden ?? [] };
  });
  const [pubText, setPubText] = useState(argsToText(d.tests_public));
  const [hidText, setHidText] = useState(argsToText(d.tests_hidden));
  const [forbiddenText, setForbiddenText] = useState((d.forbidden ?? []).join(", "));
  // ЖИ үлгі жауаптары: бірнешеуі «=====» жолымен бөлінеді
  const [aiText, setAiText] = useState((task?.ai_refs ?? []).join("\n=====\n"));
  const [computed, setComputed] = useState<{ pub: string[]; hid: string[] } | null>(
    task ? { pub: d.tests_public.map((t) => t.expected), hid: d.tests_hidden.map((t) => t.expected) } : null,
  );
  const [busy, setBusy] = useState<"" | "save" | "run" | "upload">("");
  const [msg, setMsg] = useState("");

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const entry = (d.entry ?? "").trim() || guessEntry(d.solution_code) || guessEntry(d.starter_code);
  const diff = kind === "debug" ? changedLines(d.starter_code ?? "", d.solution_code ?? "") : 0;

  function setOption(i: number, text: string) {
    const o = [...(d.options ?? [])];
    o[i] = { ...o[i], text };
    set("options", o);
  }

  async function uploadImage(file: File) {
    if (!file.type.startsWith("image/")) return setMsg("! тек сурет файлы");
    if (file.size > 2 * 1024 * 1024) return setMsg("! сурет 2 МБ-тан аспауы керек");
    setBusy("upload");
    setMsg("");
    try {
      const { url } = await api.admin.uploadImage(file);
      set("image_url", url);
    } catch (e) {
      setMsg("! сурет жүктелмеді: " + (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  /** Эталон шешімді браузердегі Python-мен орындап, күтілетін шығыстарды толтырады. */
  async function compute(): Promise<{ pub: TestCase[]; hid: TestCase[] } | null> {
    const pub = parseArgs(pubText);
    if (!pub.ok) { setMsg(`! ашық тесттер, ${pub.line}-жол: ${pub.error}`); return null; }
    const hid = parseArgs(hidText);
    if (!hid.ok) { setMsg(`! жасырын тесттер, ${hid.line}-жол: ${hid.error}`); return null; }
    if (!hid.list.length) { setMsg("! кемінде бір жасырын тест керек — «Жіберу» солармен тексереді"); return null; }
    if (!entry) { setMsg("! функция атын жазыңыз (мысалы total)"); return null; }
    if (!(d.solution_code ?? "").trim()) { setMsg("! эталон шешімді жазыңыз"); return null; }

    setBusy("run");
    setMsg("Python-да эталон шешім орындалуда…");
    try {
      const out = await pyRunner().run(d.solution_code ?? "", entry, [...pub.list, ...hid.list], 15_000);
      const res = out.results;
      setComputed({ pub: res.slice(0, pub.list.length), hid: res.slice(pub.list.length) });
      const bad = res.findIndex((r) => r.startsWith("!ERR"));
      if (bad >= 0) {
        setMsg(`! эталон шешім қате берді: ${res[bad]}`);
        return null;
      }
      setMsg(`✓ ${res.length} тесттің шығысы есептелді`);
      return {
        pub: pub.list.map((args, i) => ({ args, expected: res[i] })),
        hid: hid.list.map((args, i) => ({ args, expected: res[pub.list.length + i] })),
      };
    } catch (e) {
      setMsg("! " + (e as Error).message);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d.title.trim()) return setMsg("! тапсырманың атауы керек");
    const payload: Record<string, unknown> = { ...d, round_id: roundId, variant: kind === "mcq" ? d.variant : null };

    if (kind === "mcq") {
      const filled = (d.options ?? []).filter((o) => o.text.trim());
      if (filled.length < 2) return setMsg("! кемінде екі жауап нұсқасы керек");
      if (!d.correct || !(d.options ?? []).find((o) => o.key === d.correct)?.text.trim()) return setMsg("! дұрыс жауапты белгілеңіз (бос емес нұсқа)");
      payload.options = filled;
    } else {
      const forbidden = forbiddenText.split(",").map((s) => s.trim()).filter(Boolean);
      const hit = forbidden.find((f) => (d.solution_code ?? "").includes(f));
      if (hit) return setMsg(`! эталон шешімнің өзінде тыйым салынған «${hit}» бар`);
      if (kind === "debug") {
        const max = d.max_changed_lines ?? 1;
        if (diff === 0) return setMsg("! эталон шешім қатесі бар кодтан айырмашылығы жоқ");
        if (diff > max) return setMsg(`! эталон шешім ${diff} жолды өзгертеді, ал шек — ${max}`);
      }
      const tests = await compute(); // сақтар алдында шығыстар әрдайым қайта есептеледі
      if (!tests) return;
      Object.assign(payload, { entry, forbidden, tests_public: tests.pub, tests_hidden: tests.hid, max_changed_lines: kind === "debug" ? d.max_changed_lines ?? 1 : null });
      payload.ai_refs = aiText.split(/^\s*={5,}\s*$/m).map((x) => x.trim()).filter(Boolean);
    }

    setBusy("save");
    try {
      if (task) await api.admin.updateTask(task.id, payload as Partial<Task>);
      else await api.admin.createTask(payload as Omit<Task, "id">);
    } catch (e) {
      setBusy("");
      return setMsg("! " + (e as Error).message);
    }
    setBusy("");
    onDone();
  }

  const resultList = (lines: string, results: string[] | undefined) => {
    const parsed = parseArgs(lines);
    if (!parsed.ok || !parsed.list.length || !results) return null;
    return (
      <div className="stack" style={{ gap: 4, marginTop: 8 }}>
        {parsed.list.map((a, i) => (
          <code key={i} className="tiny" style={{ textTransform: "none", letterSpacing: 0, color: results[i]?.startsWith("!ERR") ? "var(--err)" : "var(--muted)" }}>
            {entry}({a.map((x) => JSON.stringify(x)).join(", ")}) → {results[i] ?? "?"}
          </code>
        ))}
      </div>
    );
  };

  return (
    <form className="card" style={{ borderColor: "var(--accent)" }} onSubmit={save}>
      <div className="card-head">
        <span>{task ? `тапсырма #${task.idx} — өңдеу` : "жаңа тапсырма"}</span>
        <span>{kind}</span>
      </div>
      <div className="card-body">
        <div className={kind === "mcq" ? "row3" : "row2"}>
          <div className="field">
            <label>Реті</label>
            <input type="number" min={1} value={d.idx} onChange={(e) => set("idx", Number(e.target.value))} required />
          </div>
          <div className="field">
            <label>Ұпай</label>
            <input type="number" min={0} value={d.points} onChange={(e) => set("points", Number(e.target.value))} required />
          </div>
          {kind === "mcq" && (
            <div className="field">
              <label>Нұсқа</label>
              <select value={d.variant ?? ""} onChange={(e) => set("variant", (e.target.value || null) as Draft["variant"])}>
                <option value="">бәріне ортақ</option>
                <option value="A">A нұсқасы</option>
                <option value="B">B нұсқасы</option>
              </select>
            </div>
          )}
        </div>

        <div className="field">
          <label>Атауы</label>
          <input value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="Тізімдегі ең үлкен сан" required />
        </div>

        <div className="field">
          <label>Шарты · код үшін ```python … ``` қолданыңыз</label>
          <textarea value={d.statement} spellCheck={false} onChange={(e) => set("statement", e.target.value)}
                    placeholder={"Код не шығарады?\n```python\nprint(2 ** 3)\n```"} />
        </div>

        {kind === "mcq" && (
          <>
            <div className="field">
              <label>Код суреті (міндетті емес)</label>
              {d.image_url ? (
                <div className="stack" style={{ gap: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.image_url} alt="" style={{ maxWidth: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 10, border: "1px solid var(--hairline)", alignSelf: "flex-start" }} />
                  <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => set("image_url", null)}>суретті алып тастау</button>
                </div>
              ) : (
                <input type="file" accept="image/*" disabled={busy === "upload"}
                       onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
              )}
              {busy === "upload" && <p className="tiny" style={{ marginTop: 8 }}>жүктелуде…</p>}
            </div>

            <div className="field">
              <label>Жауап нұсқалары — дұрысын белгілеңіз</label>
              <div className="stack" style={{ gap: 10 }}>
                {(d.options ?? []).map((o, i) => (
                  <div key={o.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, minWidth: 44, cursor: "pointer" }}>
                      <input type="radio" name="correct" checked={d.correct === o.key} onChange={() => set("correct", o.key)}
                             style={{ width: 16, minHeight: 16, accentColor: "var(--accent)" }} />
                      <span style={{ color: d.correct === o.key ? "var(--accent)" : "var(--dim)" }}>{o.key})</span>
                    </label>
                    <input value={o.text} onChange={(e) => setOption(i, e.target.value)} placeholder={`${o.key} нұсқасы`} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {kind !== "mcq" && (
          <>
            <div className="field">
              <label>{kind === "debug" ? "Қатесі бар код (студентке көрінеді)" : "Бастапқы шаблон (студентке көрінеді)"}</label>
              <textarea value={d.starter_code ?? ""} spellCheck={false} onChange={(e) => set("starter_code", e.target.value)} style={{ minHeight: 160 }} />
            </div>
            <div className="field">
              <label>Эталон шешім (студентке көрінбейді)</label>
              <textarea value={d.solution_code ?? ""} spellCheck={false} onChange={(e) => set("solution_code", e.target.value)} style={{ minHeight: 140 }} />
              {kind === "debug" && (
                <p className="tiny" style={{ marginTop: 8, color: diff > (d.max_changed_lines ?? 1) || diff === 0 ? "var(--err)" : "var(--accent)" }}>
                  эталон шешім {diff} жолды өзгертеді
                </p>
              )}
            </div>

            {kind === "code" && (
              <div className="field">
                <label>ЖИ үлгі жауабы (міндетті емес, студентке көрінбейді)</label>
                <textarea value={aiText} spellCheck={false} onChange={(e) => setAiText(e.target.value)} style={{ minHeight: 100 }}
                          placeholder={"Осы тапсырманы ЖИ-ға беріп, алған жауабын осында қойыңыз.\nБірнеше жауап болса, араларына ===== деген жол қойыңыз."} />
                <p className="tiny" style={{ marginTop: 8, textTransform: "none", letterSpacing: "0.03em" }}>
                  «ЖИ талдауы» бетінде студент кодтары осы үлгімен салыстырылады.
                </p>
              </div>
            )}

            <div className="row2">
              <div className="field">
                <label>Функция аты</label>
                <input value={d.entry ?? ""} onChange={(e) => set("entry", e.target.value)} placeholder={guessEntry(d.solution_code) || "total"} />
              </div>
              {kind === "debug" ? (
                <div className="field">
                  <label>Өзгертуге болатын жол саны</label>
                  <input type="number" min={1} max={20} value={d.max_changed_lines ?? 1} onChange={(e) => set("max_changed_lines", Number(e.target.value))} />
                </div>
              ) : (
                <div className="field">
                  <label>Тыйым салынған (үтірмен)</label>
                  <input value={forbiddenText} onChange={(e) => setForbiddenText(e.target.value)} placeholder="set(, sorted(" />
                </div>
              )}
            </div>

            <div className="field">
              <label>Ашық мысалдар · әр жол — аргументтер тізімі (студентке көрінеді)</label>
              <textarea value={pubText} spellCheck={false} onChange={(e) => { setPubText(e.target.value); setComputed(null); }}
                        placeholder={"[[1, 2, 3]]\n[[]]"} style={{ minHeight: 80 }} />
              {resultList(pubText, computed?.pub)}
            </div>
            <div className="field">
              <label>Жасырын тесттер · «Жіберу» кезінде бәрі тексеріледі (25-тен көп болса — кездейсоқ 25-і)</label>
              <textarea value={hidText} spellCheck={false} onChange={(e) => { setHidText(e.target.value); setComputed(null); }}
                        placeholder={"[[5, 5]]\n[[-2, 2]]\n[[7]]"} style={{ minHeight: 120 }} />
              {resultList(hidText, computed?.hid)}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => compute()} disabled={!!busy} style={{ marginBottom: 16 }}>
              {busy === "run" ? "есептелуде…" : "Шығыстарды есептеу"}
            </button>
          </>
        )}

        <div className="actions" style={{ marginTop: 6 }}>
          <button className="btn" type="submit" disabled={!!busy}>
            {busy === "save" ? "сақталуда…" : busy === "run" ? "тексерілуде…" : "Сақтау"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onCancel}>Болдырмау</button>
        </div>
        <p className={"msg" + (msg.startsWith("!") ? " err" : "")}>{msg}</p>
      </div>
    </form>
  );
}

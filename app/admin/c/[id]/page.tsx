"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase, type Contest, type Round, type Task, KIND_LABEL } from "../../../../lib/supabase";
import TaskEditor from "../../TaskEditor";
import OperatorConsole from "../../OperatorConsole";
import RecheckPanel from "../../RecheckPanel";

const STATUSES: Contest["status"][] = ["draft", "published", "running", "finished"];
const STATUS_LABEL: Record<Contest["status"], string> = {
  draft: "жоба", published: "жарияланды", running: "жүріп жатыр", finished: "аяқталды",
};

export default function ContestPage() {
  const { id } = useParams<{ id: string }>();
  const [contest, setContest] = useState<Contest | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editing, setEditing] = useState<{ roundId: string; task: Task | null } | null>(null);
  const [msg, setMsg] = useState("");
  // Атауы мен басталу уақыты басты бетте (кері санақ, күні) көрсетіледі — осы жерден өзгертіледі
  const [edit, setEdit] = useState<{ title: string; startsLocal: string } | null>(null);

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([
      supabase.from("contests").select("*").eq("id", id).single(),
      supabase.from("rounds").select("*").eq("contest_id", id).order("idx"),
    ]);
    if (c.error) return setMsg("! " + c.error.message);
    setContest(c.data as Contest);
    const rs = (r.data ?? []) as Round[];
    setRounds(rs);
    if (rs.length) {
      const { data: t } = await supabase
        .from("tasks").select("*")
        .in("round_id", rs.map((x) => x.id))
        .order("idx");
      setTasks((t ?? []) as Task[]);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  // Кезең күйі (басталды/аяқталды) басқа әкімшінің әрекетімен де өзгереді
  useEffect(() => {
    const t = setInterval(() => {
      supabase.from("rounds").select("*").eq("contest_id", id).order("idx")
        .then(({ data }) => data && setRounds(data as Round[]));
    }, 15_000);
    return () => clearInterval(t);
  }, [id]);

  async function setStatus(status: Contest["status"]) {
    const { error } = await supabase.from("contests").update({ status }).eq("id", id);
    if (error) return setMsg("! " + error.message);
    setContest((c) => (c ? { ...c, status } : c));
  }

  // ISO → <input type="datetime-local"> мәні (браузердің жергілікті уақытымен)
  function toLocalInput(iso: string) {
    const d = new Date(iso);
    const p2 = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const title = edit.title.trim();
    const t = new Date(edit.startsLocal);
    if (!title) return setMsg("! жарыстың атауы керек");
    if (isNaN(t.getTime())) return setMsg("! басталу уақытын дұрыс енгізіңіз");
    const starts_at = t.toISOString();
    const { error } = await supabase.from("contests").update({ title, starts_at }).eq("id", id);
    if (error) return setMsg("! " + error.message);
    setContest((c) => (c ? { ...c, title, starts_at } : c));
    setEdit(null);
    setMsg("");
  }

  async function removeTask(t: Task) {
    if (!confirm(`«${t.title}» тапсырмасы өшірілсін бе?`)) return;
    const { error } = await supabase.from("tasks").delete().eq("id", t.id);
    if (error) return setMsg("! " + error.message);
    load();
  }

  if (!contest) return <div className="wrap" style={{ padding: "80px 0" }}>
    <p className="tiny">{msg || "жүктелуде…"}</p></div>;

  return (
    <div className="wrap" style={{ padding: "clamp(40px,7vh,84px) var(--pad)" }}>
      <Link href="/admin" className="tiny" style={{ display: "inline-block", marginBottom: 20 }}>
        ← жарыстар
      </Link>

      <div className="between" style={{ marginBottom: 30 }}>
        <div>
          <p className="kicker">{contest.slug}</p>
          {edit ? (
            <form onSubmit={saveInfo} className="stack" style={{ gap: 10, maxWidth: 460 }}>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="ct">Атауы</label>
                <input id="ct" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="cs">Басталу уақыты</label>
                <input id="cs" type="datetime-local" value={edit.startsLocal}
                       onChange={(e) => setEdit({ ...edit, startsLocal: e.target.value })} required />
              </div>
              <div className="actions">
                <button className="btn btn-sm" type="submit">Сақтау</button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEdit(null)}>Болдырмау</button>
              </div>
            </form>
          ) : (
            <>
              <h1 className="h1">{contest.title}</h1>
              <p className="tiny" style={{ marginTop: 8 }}>
                {new Date(contest.starts_at).toLocaleString("kk-KZ")}
                {" · "}
                <button type="button" onClick={() => setEdit({ title: contest.title, startsLocal: toLocalInput(contest.starts_at) })}
                        style={{ color: "var(--accent)", letterSpacing: "inherit", textTransform: "inherit", fontSize: "inherit" }}>
                  өңдеу
                </button>
              </p>
              <p className="tiny" style={{ marginTop: 6, textTransform: "none", letterSpacing: "0.04em" }}>
                Атауы мен уақыты басты бетте көрсетіледі (жарыс «жарияланды» не «жүріп жатыр» күйінде болса).
              </p>
            </>
          )}
        </div>
        <div className="actions">
          {STATUSES.map((s) => (
            <button key={s}
                    className={"btn btn-sm " + (contest.status === s ? "" : "btn-ghost")}
                    onClick={() => setStatus(s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {msg && <p className="msg err" style={{ marginBottom: 16 }}>{msg}</p>}

      <OperatorConsole contest={contest} rounds={rounds} onChanged={load} />

      <div className="stack" style={{ gap: 26 }}>
        {rounds.map((r) => {
          const mine = tasks.filter((t) => t.round_id === r.id);
          const nextIdx = mine.length ? Math.max(...mine.map((t) => t.idx)) + 1 : 1;
          const isEditingHere = editing?.roundId === r.id;
          return (
            <section key={r.id}>
              <div className="between" style={{ marginBottom: 14 }}>
                <div>
                  <p className="tiny">{r.idx}-кезең · {r.duration_min} мин</p>
                  <h2 className="h2" style={{ marginTop: 6 }}>{KIND_LABEL[r.kind]}</h2>
                </div>
                <button className="btn btn-sm"
                        onClick={() => setEditing({ roundId: r.id, task: null })}>
                  + тапсырма
                </button>
              </div>

              {isEditingHere && (
                <div style={{ marginBottom: 16 }}>
                  <TaskEditor
                    kind={r.kind}
                    roundId={r.id}
                    task={editing!.task}
                    nextIdx={nextIdx}
                    onCancel={() => setEditing(null)}
                    onDone={() => { setEditing(null); load(); }}
                  />
                </div>
              )}

              {mine.length === 0 && !isEditingHere ? (
                <div className="card"><div className="card-body">
                  <p className="muted">Бұл кезеңде тапсырма жоқ.</p>
                </div></div>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  {mine.map((t) => (
                    <div key={t.id} className="card">
                      <div className="card-body between">
                        <div style={{ minWidth: 0 }}>
                          <p style={{ color: "var(--title)" }}>
                            <span style={{ color: "var(--dim)" }}>
                              {String(t.idx).padStart(2, "0")}
                            </span>{" "}
                            {t.title}
                          </p>
                          <p className="tiny" style={{ marginTop: 6 }}>
                            {t.points} ұпай
                            {r.kind === "mcq"
                              ? ` · дұрыс жауап: ${t.correct ?? "—"}${t.variant ? ` · ${t.variant} нұсқасы` : ""}${t.image_url ? " · сурет" : ""}`
                              : ` · ${t.entry ?? "?"}() · ${(t.tests_public ?? []).length} ашық + ${(t.tests_hidden ?? []).length} жасырын тест`}
                          </p>
                        </div>
                        <div className="actions">
                          <button className="btn btn-ghost btn-sm"
                                  onClick={() => setEditing({ roundId: r.id, task: t })}>
                            өңдеу
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => removeTask(t)}>
                            өшіру
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="tiny" style={{ marginTop: 10 }}>
                келесі реті: {nextIdx} · барлығы {mine.filter((t) => t.variant !== "B").reduce((s, t) => s + t.points, 0)} ұпай
              </p>
            </section>
          );
        })}
      </div>

      <RecheckPanel contestId={contest.id} rounds={rounds} tasks={tasks} />

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span>жи талдауы</span><span>build кезеңі</span></div>
        <div className="card-body between">
          <p className="muted" style={{ maxWidth: 620 }}>
            Студенттердің Build кодтарын бір-бірімен салыстырады, шешу уақытын және басқа белгілерді жинап, әр студентке күдік деңгейін себептерімен көрсетеді.
          </p>
          <Link href={`/admin/c/${contest.id}/ai`} className="btn">ЖИ талдауын ашу</Link>
        </div>
      </section>
    </div>
  );
}

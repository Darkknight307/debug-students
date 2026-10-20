"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, KIND_LABEL, type Contest, type Round } from "../../lib/supabase";

type Ext = { student_id: string; extra_min: number; name: string };
type Found = { id: string; full_name: string };

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Оператор консолі: кезеңді бастау / бәріне +5 мин / аяқтау (дерекқор сағатымен, RPC),
 * интернеті үзілген студентке жеке +5 мин, лидербордты жабу.
 */
export default function OperatorConsole({
  contest, rounds, onChanged,
}: {
  contest: Contest;
  rounds: Round[];
  onChanged: () => void;
}) {
  const [, tick] = useState(0);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [stats, setStats] = useState<{ subs: number; people: number } | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [exts, setExts] = useState<Ext[]>([]);

  const running = rounds.find((r) => r.status === "running") ?? null;

  const loadLive = useCallback(async () => {
    const [subs, people] = await Promise.all([
      supabase.from("submissions").select("id", { count: "exact", head: true }).eq("contest_id", contest.id),
      supabase.from("contest_variants").select("student_id", { count: "exact", head: true }).eq("contest_id", contest.id),
    ]);
    setStats({ subs: subs.count ?? 0, people: people.count ?? 0 });
    if (running) {
      const { data } = await supabase.from("round_extensions").select("student_id, extra_min, students(full_name)").eq("round_id", running.id);
      setExts((data ?? []).map((r: { student_id: string; extra_min: number; students: unknown }) => ({
        student_id: r.student_id,
        extra_min: r.extra_min,
        name: (r.students as { full_name?: string } | null)?.full_name ?? "?",
      })));
    } else setExts([]);
  }, [contest.id, running]);

  useEffect(() => {
    loadLive();
    const a = setInterval(loadLive, 10_000);
    const b = setInterval(() => tick((n) => n + 1), 1_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [loadLive]);

  async function rpc(name: string, args: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(name);
    setMsg("");
    const { error } = await supabase.rpc(name, args);
    setBusy("");
    if (error) return setMsg("! " + error.message);
    onChanged();
  }

  async function setBoard(patch: Partial<Contest>) {
    const { error } = await supabase.from("contests").update(patch).eq("id", contest.id);
    if (error) return setMsg("! " + error.message);
    onChanged();
  }

  async function search(text: string) {
    setQ(text);
    if (text.trim().length < 2) return setFound([]);
    const { data } = await supabase.from("students").select("id, full_name").ilike("full_name", `%${text.trim()}%`).order("full_name").limit(8);
    setFound((data ?? []) as Found[]);
  }

  async function extendStudent(s: Found) {
    if (!running) return;
    const prev = exts.find((e) => e.student_id === s.id)?.extra_min ?? 0;
    const { error } = await supabase.from("round_extensions")
      .upsert({ round_id: running.id, student_id: s.id, extra_min: Math.min(prev + 5, 60) }, { onConflict: "round_id,student_id" });
    if (error) return setMsg("! " + error.message);
    setMsg(`✓ ${s.full_name}: +${prev + 5} мин (${running.idx}-кезең)`);
    setQ("");
    setFound([]);
    loadLive();
  }

  const now = Date.now();
  const lastRound = rounds[rounds.length - 1];
  const autoLockAt = lastRound?.status === "running" && lastRound.ends_at
    ? Date.parse(lastRound.ends_at) - (contest.board_autolock_min ?? 10) * 60_000 : null;

  return (
    <section className="card" style={{ marginBottom: 34, borderColor: running ? "rgba(242,169,59,.45)" : undefined }}>
      <div className="card-head">
        <span>оператор консолі</span>
        <span>{stats ? `${stats.people} студент Trace ашты · ${stats.subs} жіберілім` : "…"}</span>
      </div>
      <div className="card-body stack" style={{ gap: 18 }}>
        <div className="stack" style={{ gap: 10 }}>
          {rounds.map((r) => {
            const left = r.status === "running" && r.ends_at ? Date.parse(r.ends_at) - now : null;
            return (
              <div key={r.id} className="between" style={{ padding: "10px 0", borderBottom: "1px solid var(--hairline-soft)" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: "var(--title)" }}>{r.idx}. {KIND_LABEL[r.kind]} · {r.duration_min} мин</p>
                  <p className="tiny" style={{ marginTop: 4, color: r.status === "running" ? "var(--warn)" : undefined }}>
                    {r.status === "running"
                      ? left! > 0 ? `жүріп жатыр · ${fmt(left!)} қалды` : "уақыты бітті (жеке +мин алғандар ғана жалғастырады)"
                      : r.status === "closed" ? "аяқталды" : "басталмаған"}
                  </p>
                </div>
                <div className="actions">
                  {r.status !== "running" && (
                    <button className="btn btn-sm" disabled={!!busy}
                            onClick={() => rpc("admin_start_round", { p_round: r.id },
                              `${r.idx}-кезеңді (${KIND_LABEL[r.kind]}) бастаймыз ба?${running ? `\n${running.idx}-кезең жабылады.` : ""}${r.status === "closed" ? "\nБұл кезең бұрын өткен — уақыты қайта басталады." : ""}`)}>
                      бастау
                    </button>
                  )}
                  {r.status === "running" && (
                    <>
                      <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => rpc("admin_extend_round", { p_round: r.id, p_min: 5 })}>
                        +5 мин бәріне
                      </button>
                      <button className="btn btn-danger btn-sm" disabled={!!busy}
                              onClick={() => rpc("admin_close_round", { p_round: r.id }, `${r.idx}-кезеңді қазір аяқтаймыз ба? Студенттер жауап жібере алмайды.`)}>
                        аяқтау
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="between">
          <div>
            <p style={{ color: "var(--title)" }}>Лидерборд {contest.board_locked ? "жабық 🔒" : "ашық"}</p>
            <p className="tiny" style={{ marginTop: 4 }}>
              соңғы кезеңнің соңғы {contest.board_autolock_min ?? 10} минутында өзі жабылады
              {autoLockAt ? ` · ${autoLockAt > now ? fmt(autoLockAt - now) + " кейін" : "қазір жабық"}` : ""}
            </p>
          </div>
          <div className="actions">
            <select value={contest.board_autolock_min ?? 10} style={{ width: 110, minHeight: 36, padding: "4px 10px", fontSize: 13 }}
                    onChange={(e) => setBoard({ board_autolock_min: Number(e.target.value) })}>
              {[0, 5, 10, 15].map((m) => <option key={m} value={m}>{m ? `${m} мин` : "өшірулі"}</option>)}
            </select>
            <button className={"btn btn-sm " + (contest.board_locked ? "" : "btn-ghost")} onClick={() => setBoard({ board_locked: !contest.board_locked })}>
              {contest.board_locked ? "ашу" : "қолмен жабу"}
            </button>
          </div>
        </div>

        <div>
          <p style={{ color: "var(--title)" }}>Жеке +5 мин (интернеті үзілген студентке)</p>
          {running ? (
            <>
              <input value={q} onChange={(e) => search(e.target.value)} placeholder="студенттің аты-жөні…" style={{ marginTop: 10 }} />
              {found.length > 0 && (
                <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                  {found.map((s) => (
                    <button key={s.id} type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: "space-between" }} onClick={() => extendStudent(s)}>
                      <span style={{ textTransform: "none", letterSpacing: 0 }}>{s.full_name}</span><span>+5 мин</span>
                    </button>
                  ))}
                </div>
              )}
              {exts.length > 0 && (
                <p className="tiny" style={{ marginTop: 10, lineHeight: 1.8, textTransform: "none", letterSpacing: 0 }}>
                  {running.idx}-кезеңде қосымша уақыт: {exts.map((e) => `${e.name} (+${e.extra_min})`).join(", ")}
                </p>
              )}
            </>
          ) : (
            <p className="tiny" style={{ marginTop: 6 }}>кезең жүріп жатқанда ғана</p>
          )}
        </div>

        <p className={"msg" + (msg.startsWith("!") ? " err" : "")} style={{ marginTop: 0 }}>{msg}</p>
      </div>
    </section>
  );
}

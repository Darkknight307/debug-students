"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, type Contest } from "../../lib/supabase";

const STATUS_LABEL: Record<Contest["status"], string> = {
  draft: "жоба",
  published: "жарияланды",
  running: "жүріп жатыр",
  finished: "аяқталды",
};

function monthSlug(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminHome() {
  const [list, setList] = useState<Contest[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(monthSlug());
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [stats, setStats] = useState<{ total: number; unconfirmed: number | null; byUni: [string, number][] } | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("contests")
      .select("id,slug,title,starts_at,status")
      .order("starts_at", { ascending: false });
    if (error) setMsg("! " + error.message);
    setList(data ?? []);
  }
  async function loadStats() {
    // students кестесі 002_students.sql орындалғанша жоқ — қате болса карточка көрсетілмейді
    const [all, unc] = await Promise.all([
      supabase.from("students").select("university", { count: "exact" }).limit(5000),
      // Расталмаған тіркелулер auth.users-те ғана — оны тек әкімшіге ашық RPC санайды
      supabase.rpc("admin_unconfirmed_count"),
    ]);
    if (all.error) return;
    // Оқу орны еркін жазылады: бос орын мен регистрді елемей топтаймыз, ең көп жазылған нұсқасын көрсетеміз
    const groups = new Map<string, { n: number; names: Map<string, number> }>();
    for (const r of (all.data ?? []) as { university: string | null }[]) {
      const name = (r.university || "—").replace(/\s+/g, " ").trim();
      const key = name.toLowerCase();
      const g = groups.get(key) ?? { n: 0, names: new Map() };
      g.n++;
      g.names.set(name, (g.names.get(name) ?? 0) + 1);
      groups.set(key, g);
    }
    const byUni = [...groups.values()]
      .map((g) => [[...g.names].sort((a, b) => b[1] - a[1])[0][0], g.n] as [string, number])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    setStats({ total: all.count ?? 0, unconfirmed: unc.error ? null : Number(unc.data ?? 0), byUni });
  }
  useEffect(() => { load(); loadStats(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const { data, error } = await supabase
      .from("contests")
      .insert({ slug, title, starts_at: new Date(startsAt).toISOString() })
      .select("id")
      .single();

    if (error || !data) {
      setBusy(false);
      return setMsg("! " + (error?.message ?? "құрылмады"));
    }

    // Үш кезең бірден құрылады — жарыс құрылымы әрқашан бірдей
    const rounds = [
      { contest_id: data.id, idx: 1, kind: "mcq", title: "Trace — кодты оқу", duration_min: 20 },
      { contest_id: data.id, idx: 2, kind: "debug", title: "Debug — қатені түзет", duration_min: 30 },
      { contest_id: data.id, idx: 3, kind: "code", title: "Build — өзің жаз", duration_min: 20 },
    ];
    const { error: rErr } = await supabase.from("rounds").insert(rounds);
    setBusy(false);
    if (rErr) return setMsg("! кезеңдер құрылмады: " + rErr.message);

    setOpen(false);
    setTitle("");
    load();
  }

  return (
    <div className="wrap" style={{ padding: "clamp(48px,8vh,96px) var(--pad)" }}>
      <div className="between" style={{ marginBottom: 32 }}>
        <div>
          <p className="kicker">Әкімші панелі</p>
          <h1 className="h1">Жарыстар</h1>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setOpen((v) => !v)}>
            {open ? "Жабу" : "Жаңа жарыс"}
          </button>
          <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>
            Шығу
          </button>
        </div>
      </div>

      {open && (
        <form className="card" style={{ marginBottom: 26 }} onSubmit={create}>
          <div className="card-head">жаңа жарыс</div>
          <div className="card-body">
            <div className="row2">
              <div className="field">
                <label htmlFor="slug">Кілт (ай)</label>
                <input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)}
                       placeholder="2026-10" required />
              </div>
              <div className="field">
                <label htmlFor="st">Басталу уақыты</label>
                <input id="st" type="datetime-local" value={startsAt}
                       onChange={(e) => setStartsAt(e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="ti">Атауы</label>
              <input id="ti" value={title} onChange={(e) => setTitle(e.target.value)}
                     placeholder="DEBUG · Қазан 2026" required />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "құрылуда…" : "Құру"}
            </button>
            <p className="tiny" style={{ marginTop: 12 }}>
              Үш кезең автоматты құрылады: тест → дебаг → есеп шығару
            </p>
          </div>
        </form>
      )}

      {stats && (
        <div className="card" style={{ marginBottom: 26 }}>
          <div className="card-body between">
            <div>
              <p className="tiny">Тіркелген студенттер</p>
              <p className="h2" style={{ marginTop: 6 }}>{stats.total}</p>
            </div>
            <div>
              <p className="tiny">Оқу орындары</p>
              <p className="h2" style={{ marginTop: 6 }}>{stats.byUni.length}</p>
            </div>
            <div>
              <p className="tiny">Email расталмаған</p>
              <p className="h2" style={{ marginTop: 6 }}>{stats.unconfirmed ?? "—"}</p>
            </div>
          </div>
          {stats.byUni.length > 0 && (
            <div className="card-body" style={{ borderTop: "1px solid var(--hairline)" }}>
              <p className="tiny" style={{ marginBottom: 12 }}>Оқу орындары бойынша</p>
              <div className="stack" style={{ gap: 8 }}>
                {stats.byUni.slice(0, 12).map(([name, n]) => (
                  <div key={name} className="between" style={{ flexWrap: "nowrap" }}>
                    <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                    <span style={{ color: "var(--title)", fontVariantNumeric: "tabular-nums" }}>{n}</span>
                  </div>
                ))}
                {stats.byUni.length > 12 && (
                  <p className="tiny">тағы {stats.byUni.length - 12} оқу орны · {stats.byUni.slice(12).reduce((a, [, n]) => a + n, 0)} студент</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {msg && <p className="msg err">{msg}</p>}

      {list === null ? (
        <p className="tiny">жүктелуде…</p>
      ) : list.length === 0 ? (
        <div className="card"><div className="card-body">
          <p className="muted">Әзірге жарыс жоқ. «Жаңа жарыс» батырмасын басыңыз.</p>
        </div></div>
      ) : (
        <div className="stack">
          {list.map((c) => (
            <Link key={c.id} href={`/admin/c/${c.id}`} className="card"
                  style={{ display: "block", transition: "border-color .28s var(--ease)" }}>
              <div className="card-body between">
                <div>
                  <h2 className="h2">{c.title}</h2>
                  <p className="tiny" style={{ marginTop: 8 }}>
                    {c.slug} · {new Date(c.starts_at).toLocaleString("kk-KZ")}
                  </p>
                </div>
                <span className={"pill " + c.status}>{STATUS_LABEL[c.status]}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

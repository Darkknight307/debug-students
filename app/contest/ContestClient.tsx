"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import TraceRound from "./TraceRound";
import CodeRound from "./CodeRound";
import { pyRunner } from "../../lib/contest/pyRunner";
import { Telemetry } from "../../lib/contest/telemetry";
import Decode from "../ui/Decode";
import {
  KIND_HINT, KIND_SHORT, fmtClock,
  type ActiveFull, type CodeTask, type McqTask, type StateResponse,
} from "./types";

const POLL_MS = 10_000;

/**
 * Жарыс беті. Сервер күйі 10 секунд сайын сұралады (Realtime қолданылмайды —
 * тегін тарифтің 200 қосылым шегі 500 оқушыға жетпейді). Кезең ауысса,
 * тапсырмалар бірден қайта жүктеледі. Таймер сервер сағатымен түзетіледі.
 */
export default function ContestClient() {
  const [st, setSt] = useState<StateResponse | null>(null);
  const [full, setFull] = useState<ActiveFull | null>(null);
  const [error, setError] = useState("");
  const [, tick] = useState(0);
  const offset = useRef(0); // сервер уақыты − браузер уақыты
  const fullId = useRef<string | null>(null);
  const busy = useRef(false);

  const poll = useCallback(async (forceFull = false) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const light = await fetchState(false);
      if (!light) return;
      const activeId = light.active?.roundId ?? null;
      if (activeId && (forceFull || activeId !== fullId.current)) {
        const heavy = await fetchState(true);
        if (heavy?.active && "tasks" in heavy.active) {
          fullId.current = heavy.active.roundId;
          setFull(heavy.active);
        }
      } else if (!activeId) {
        fullId.current = null;
        setFull(null);
      }
      setSt(light);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
    }

    async function fetchState(withTasks: boolean): Promise<StateResponse | null> {
      const t0 = Date.now();
      const r = await fetch(`/api/contest/state${withTasks ? "?full=1" : ""}`, { cache: "no-store" });
      if (r.status === 401) {
        window.location.href = "/login";
        return null;
      }
      const d = (await r.json()) as StateResponse;
      if (!d.ok) throw new Error(d.message || "Сервер қатесі");
      const rtt = Date.now() - t0;
      offset.current = Date.parse(d.serverNow) + rtt / 2 - Date.now();
      return d;
    }
  }, []);

  useEffect(() => {
    poll();
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") await poll();
        loop();
      }, POLL_MS + Math.random() * 3_000);
    };
    loop();
    const onVis = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVis);
    const clock = setInterval(() => tick((n) => n + 1), 1_000);
    return () => {
      clearTimeout(timer);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  const now = Date.now() + offset.current;
  const activeRound = st?.rounds.find((r) => r.id === st.active?.roundId) ?? null;

  // Кезең ауысқанда жоғарыдан қысқа хабар шығады (бет алғаш ашылғанда — жоқ)
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null);
  const seenRound = useRef<string | null | undefined>(undefined);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!st) return;
    const id = activeRound?.id ?? null;
    if (seenRound.current === undefined) {
      seenRound.current = id;
      return;
    }
    if (seenRound.current === id) return;
    const prevId = seenRound.current;
    seenRound.current = id;
    const text = activeRound
      ? `▶ ${activeRound.idx}-кезең басталды · ${KIND_SHORT[activeRound.kind]}`
      : prevId
        ? "■ Кезең аяқталды"
        : null;
    if (!text) return;
    setBanner({ id: Date.now(), text });
    // Таймер ref-те: келесі сауалнама effect-ті қайта іске қосса да, жолақ уақытында жасырылады
    clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 2800);
  }, [st, activeRound]);
  useEffect(() => () => clearTimeout(bannerTimer.current), []);
  const endsAt = activeRound?.endsAt ? Date.parse(activeRound.endsAt) : null;
  const left = endsAt ? endsAt - now : null;
  const timeUp = left !== null && left <= 0;

  // Бақылау дерегі: кезең ашық тұрғанда ғана жиналады (кезең ауысса — жаңа есептегіш)
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const watchId = activeRound && !timeUp ? activeRound.id : null;
  useEffect(() => {
    if (!watchId) {
      setTelemetry(null);
      return;
    }
    const t = new Telemetry(watchId);
    t.start();
    setTelemetry(t);
    return () => t.stop();
  }, [watchId]);

  // Уақыт біткен сәтте күйді бірден жаңартамыз (келесі кезең немесе «аяқталды»)
  const askedAtEnd = useRef<string | null>(null);
  useEffect(() => {
    if (timeUp && activeRound && askedAtEnd.current !== activeRound.id) {
      askedAtEnd.current = activeRound.id;
      setTimeout(() => poll(), 1_500);
    }
  }, [timeUp, activeRound, poll]);

  // Python-ды алдын ала жүктеу: Debug/Build кезінде немесе Trace-тің соңғы 3 минутында
  useEffect(() => {
    if (!st?.contest) return;
    const kind = activeRound?.kind;
    const soon = kind === "mcq" ? left !== null && left < 180_000 : st.rounds.some((r) => r.kind !== "mcq" && r.state !== "closed");
    if (soon) pyRunner().load().catch(() => {});
  }, [st, activeRound, left]);

  function onVerdict(taskId: string, correct: boolean) {
    setFull((f) => (f ? { ...f, mine: { ...f.mine, [taskId]: { ...f.mine[taskId], verdict: correct ? "correct" : "wrong" } } } : f));
  }

  if (!st) {
    return (
      <Shell>
        <p className="tiny">{error || "жүктелуде…"}</p>
        {error && <button className="btn btn-ghost btn-sm" style={{ marginTop: 16 }} onClick={() => poll()}>қайталау</button>}
      </Shell>
    );
  }

  const header = (
    <header className="c-top">
      <Link href="/" className="c-brand">DEBUG<span>_</span></Link>
      <ol className="c-steps">
        {st.rounds.map((r) => (
          <li key={r.id} className={r.state + (r.id === activeRound?.id ? " cur" : "")}>
            <b>{r.idx}</b> {KIND_SHORT[r.kind]}
          </li>
        ))}
      </ol>
      <div className="c-me">
        <span className="c-name">{st.student.fullName}</span>
        {st.me && st.me.rank ? (
          <span className="c-rank">#{st.me.rank} · {st.me.score} ұпай</span>
        ) : st.boardLocked ? (
          <span className="c-rank dim">рейтинг жабық</span>
        ) : null}
      </div>
    </header>
  );

  // Жарыс жоқ
  if (!st.contest) {
    return (
      <Shell banner={banner} header={header}>
        <p className="kicker enter"><Decode text="DEBUG" /></p>
        <h1 className="h1 enter" style={{ ["--d" as string]: 1 }}>Қазір жарыс жоқ</h1>
        <p className="muted" style={{ marginTop: 14 }}>Келесі жарыс жарияланғанда осы бетте ашылады.</p>
      </Shell>
    );
  }

  // Кезең жүріп жатыр
  if (activeRound && full && full.roundId === activeRound.id) {
    const kind = activeRound.kind;
    const urgent = left !== null && left < 120_000;
    const final = left !== null && left > 0 && left < 10_000;
    return (
      <Shell banner={banner} header={header} wide={kind !== "mcq"}>
        <div className="c-round between enter" key={"head-" + full.roundId}>
          <div>
            <p className="kicker" style={{ marginBottom: 8 }}><Decode key={activeRound.id} text={`${activeRound.idx}-кезең · ${KIND_SHORT[kind]}`} /></p>
            <h1 className="h2">{full.title || KIND_HINT[kind]}</h1>
            <p className="muted" style={{ marginTop: 6 }}>{KIND_HINT[kind]}{full.variant ? ` · ${full.variant} нұсқасы` : ""}</p>
            <p className="tiny" style={{ marginTop: 8, textTransform: "none", letterSpacing: "0.03em" }}>
              Бақылау қосулы: басқа бетке өту және көшіріп-қою әрекеттері тіркеледі.
            </p>
          </div>
          <div className={"c-timer" + (urgent ? " urgent" : "") + (final ? " final" : "") + (timeUp ? " done" : "")} aria-live="off">
            <span>{timeUp ? "уақыт бітті" : "қалды"}</span>
            <b>{left !== null ? fmtClock(left) : "—"}</b>
          </div>
        </div>

        {timeUp && (
          <p className="verdict warn" style={{ marginBottom: 16 }}>
            <span>Кезең аяқталды. Жауаптарың сақталды — келесі кезеңді күт.</span>
          </p>
        )}

        <div key={"body-" + full.roundId} className="enter" style={{ ["--d" as string]: 2 }}>
          {kind === "mcq" ? (
            <TraceRound tasks={full.tasks as McqTask[]} mine={full.mine} locked={timeUp} />
          ) : (
            <CodeRound kind={kind} tasks={full.tasks as CodeTask[]} mine={full.mine} locked={timeUp} onVerdict={onVerdict} telemetry={telemetry} />
          )}
        </div>
        {error && <p className="msg err">Байланыс: {error}</p>}
      </Shell>
    );
  }

  // Кезеңдер арасы / басталуын күту / аяқталды
  const next = st.rounds.find((r) => r.state === "pending");
  const allClosed = st.rounds.length > 0 && st.rounds.every((r) => r.state === "closed");
  const startsIn = Date.parse(st.contest.startsAt) - now;

  return (
    <Shell banner={banner} header={header}>
      <p className="kicker enter"><Decode text={st.contest.title} /></p>
      {allClosed || st.contest.status === "finished" ? (
        <>
          <h1 className="h1 enter" style={{ ["--d" as string]: 1 }}>Жарыс аяқталды</h1>
          <p className="muted" style={{ marginTop: 14 }}>
            Қатысқаның үшін рақмет! {st.me?.rank ? `Сенің орның: ${st.me.rank} (${st.me.score} ұпай). ` : ""}
            Қорытынды нәтиже жүлдегерлер тексерілген соң жарияланады.
          </p>
          <div className="actions" style={{ marginTop: 24 }}>
            <Link href="/board" className="btn">Лидерборд</Link>
          </div>
        </>
      ) : st.rounds.every((r) => r.state === "pending") && startsIn > 0 ? (
        <>
          <h1 className="h1 enter" style={{ ["--d" as string]: 1 }}>Жарыс басталуына</h1>
          <p className="c-big">{fmtClock(startsIn)}</p>
          <p className="muted">Бастау уақыты келгенде ұйымдастырушы 1-кезеңді ашады — бет өзі жаңарады, ештеңе баспа.</p>
        </>
      ) : (
        <>
          <h1 className="h1 enter" style={{ ["--d" as string]: 1 }}>{next ? `${next.idx}-кезең · ${KIND_SHORT[next.kind]} жақында` : "Күте тұр"}</h1>
          <p className="muted" style={{ marginTop: 14 }}>
            {next
              ? `${KIND_HINT[next.kind]} · ${next.durationMin} минут. Ұйымдастырушы бастағанда тапсырмалар осында өзі ашылады.`
              : "Ұйымдастырушы келесі қадамды бастағанда бет өзі жаңарады."}
          </p>
          {next && next.kind !== "mcq" && (
            <p className="tiny" style={{ marginTop: 18 }}>
              Python орта: {pyStatusText()}
            </p>
          )}
        </>
      )}
      {error && <p className="msg err">Байланыс: {error}</p>}
    </Shell>
  );
}

function pyStatusText() {
  try {
    const s = pyRunner().status;
    return s === "ready" ? "дайын ✓" : s === "failed" ? "жүктелмеді — бетті жаңарт" : "жүктелуде…";
  } catch {
    return "—";
  }
}

function Shell({
  header, children, wide = false, banner = null,
}: {
  header?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
  banner?: { id: number; text: string } | null;
}) {
  return (
    <div className="c-shell">
      {header}
      {banner && (
        <div key={banner.id} className="c-banner" role="status">
          {banner.text}
        </div>
      )}
      <main className={"c-main" + (wide ? " wide" : "")}>{children}</main>
    </div>
  );
}

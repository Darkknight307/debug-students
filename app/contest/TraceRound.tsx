"use client";

import { useState } from "react";
import Rich from "./Rich";
import { postJson, type McqTask, type Mine } from "./types";

type SaveState = "saving" | "saved" | "error";

/**
 * Trace: әр сұрақта код/сурет және жауап нұсқалары. Таңдау бірден серверге кетеді,
 * кезең соңына дейін өзгертуге болады (соңғысы есептеледі). Дұрыс-бұрысы айтылмайды.
 */
export default function TraceRound({ tasks, mine, locked }: { tasks: McqTask[]; mine: Mine; locked: boolean }) {
  const [picked, setPicked] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(mine).filter(([, v]) => v.answer).map(([k, v]) => [k, v.answer!])),
  );
  const [saving, setSaving] = useState<Record<string, SaveState>>({});
  const [err, setErr] = useState<Record<string, string>>({});

  async function choose(task: McqTask, key: string) {
    if (locked) return;
    setPicked((p) => ({ ...p, [task.id]: key }));
    setSaving((s) => ({ ...s, [task.id]: "saving" }));
    const { data } = await postJson("/api/contest/answer", { taskId: task.id, choice: key });
    setSaving((s) => ({ ...s, [task.id]: data.ok ? "saved" : "error" }));
    setErr((e) => ({ ...e, [task.id]: data.ok ? "" : data.message || "Сақталмады" }));
  }

  const answered = tasks.filter((t) => picked[t.id]).length;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <nav className="qnav" aria-label="Сұрақтар">
        {tasks.map((t) => (
          <a key={t.id} href={`#q-${t.id}`}
             className={"qchip" + (picked[t.id] ? " on" : "") + (saving[t.id] === "error" ? " bad" : "")}>
            {t.idx}
          </a>
        ))}
        <span className="qcount">{answered}/{tasks.length}</span>
      </nav>

      {tasks.map((t) => {
        const st = saving[t.id];
        return (
          <article key={t.id} id={`q-${t.id}`} className="card qcard">
            <div className="card-head">
              <span>{String(t.idx).padStart(2, "0")} · {t.title}</span>
              <span key={st ?? "idle"} className={"save " + (st ?? "")}>
                {st === "saving" ? "сақталуда…" : st === "saved" ? "сақталды ✓" : st === "error" ? "сақталмады" : picked[t.id] ? "жауап бар" : `${t.points} ұпай`}
              </span>
            </div>
            <div className="card-body">
              <Rich text={t.statement} />
              {t.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="qimg" src={t.image_url} alt={`${t.idx}-сұрақтың коды`} loading="lazy" />
              )}
              <div className="opts" role="radiogroup" aria-label={`${t.idx}-сұрақтың жауабы`}>
                {t.options.map((o) => (
                  <button key={o.key} type="button" role="radio" aria-checked={picked[t.id] === o.key}
                          className={"opt" + (picked[t.id] === o.key ? " on" : "")}
                          disabled={locked} onClick={() => choose(t, o.key)}>
                    <span className="opt-key">{o.key}</span>
                    <span className="opt-text">{o.text}</span>
                  </button>
                ))}
              </div>
              {err[t.id] && <p className="msg err">{err[t.id]} — нұсқаны қайта басыңыз.</p>}
            </div>
          </article>
        );
      })}

      <p className="tiny" style={{ textAlign: "center", lineHeight: 1.8 }}>
        Жауапты кезең аяқталғанша өзгертуге болады · соңғы таңдауың есептеледі
      </p>
    </div>
  );
}

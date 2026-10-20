"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Decode from "../ui/Decode";
import { COURSES, PASSWORD_MIN, formatPhone, normalizePhone } from "../../lib/registration";
import { api } from "../../lib/client";

export type Tab = "login" | "register" | "forgot";
type Notice = { text: string; err?: boolean } | null;

const HEAD: Record<Tab, { title: string; lead: string; file: string }> = {
  login: { title: "Кіру", lead: "Тіркелген email мен құпия сөзіңізді енгізіңіз.", file: "~/debug/login.sh" },
  register: { title: "Тіркелу", lead: "Бір минуттық форма. Тіркелген соң қатысушылар тізіміне қосыласыз.", file: "~/debug/register.sh" },
  forgot: { title: "Құпия сөзді қалпына келтіру", lead: "Тіркелген email-ді енгізіңіз — жаңа құпия сөз қоятын сілтеме жібереміз.", file: "~/debug/recover.sh" },
};

export default function AuthPanel({ initialTab, emailsEnabled, notice }: { initialTab: Tab; emailsEnabled: boolean; notice: Notice }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Notice>(notice);
  const [badField, setBadField] = useState("");
  const [shaking, setShaking] = useState(false); // қате болса форма «шайқалады»
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [sentTo, setSentTo] = useState(""); // растау не қалпына келтіру хаты жіберілген email

  const [f, setF] = useState({ lastName: "", firstName: "", university: "", course: "", phone: "", email: "", password: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF((v) => ({ ...v, [k]: e.target.value }));
    if (badField === k) setBadField("");
  };
  const formRef = useRef<HTMLFormElement>(null);

  // Кірген студент жарыс бетіне (http режимінде мұны сервер жасайды; mock режимінде — осы жер)
  useEffect(() => {
    if (api.mode !== "mock") return;
    api.auth.me().then((m) => m.loggedIn && router.replace("/contest"));
  }, [router]);

  // Қате өріске фокус: студент нені түзету керегін бірден көреді
  useEffect(() => {
    if (badField) formRef.current?.querySelector<HTMLElement>(`[name="${badField}"]`)?.focus();
  }, [badField]);

  function go(t: Tab) {
    if (busy) return;
    setTab(t);
    setMsg(null);
    setBadField("");
    setUnconfirmed(false);
    setSentTo("");
    // URL әдейі өзгертілмейді: Next.js history.replaceState-ті ұстап, бетті қайта құрады
    // (барлық «кіру» анимациясы қайталанып, экран бір сәт бос қалады).
  }

  function error(text: string, field = "") {
    setMsg({ text, err: true });
    setBadField(field);
    setShaking(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    setUnconfirmed(false);
    try {
      if (tab === "login") {
        const { status, data } = await api.auth.login(f.email, f.password);
        if (status === 200 && data.ok) {
          setF((v) => ({ ...v, password: "" }));
          router.replace("/contest");
          router.refresh();
          return;
        }
        if (data.unconfirmed) setUnconfirmed(true);
        error(data.message || "Кіру мүмкін болмады. Қайталап көріңіз.");
      } else if (tab === "register") {
        const { status, data } = await api.auth.register(f);
        if (status === 200 && data.ok) {
          setF((v) => ({ ...v, password: "" }));
          if (data.loggedIn) {
            router.replace("/me?welcome=1");
            router.refresh();
            return;
          }
          setSentTo(f.email.trim());
        } else {
          error(data.message || "Тіркелу мүмкін болмады. Қайталап көріңіз.", data.field || "");
        }
      } else {
        const { status, data } = await api.auth.forgot(f.email);
        if (status === 200 && data.ok) setSentTo(f.email.trim());
        else error(data.message || "Хат жіберілмеді. Қайталап көріңіз.", status === 400 ? "email" : "");
      }
    } catch {
      error("Байланыс жоқ. Интернетті тексеріп, қайталаңыз.");
    }
    setBusy(false);
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    try {
      const { status, data } = await api.auth.resend(sentTo || f.email);
      setMsg(status === 200 ? { text: "Хат қайта жіберілді. Поштаңызды (спам қалтасын да) тексеріңіз." } : { text: data.message || "Хат жіберілмеді.", err: true });
    } catch {
      setMsg({ text: "Байланыс жоқ. Интернетті тексеріп, қайталаңыз.", err: true });
    }
    setBusy(false);
  }

  const inv = (k: string) => (badField === k ? { "aria-invalid": true as const } : {});
  const phone = normalizePhone(f.phone);
  const head = HEAD[tab];

  return (
    <>
      <h1 className="h1 enter" style={{ marginBottom: 14, ["--d" as string]: 1 }}>
        <Decode text={head.title} duration={420} />
      </h1>
      <p className="muted enter" style={{ marginBottom: 26, lineHeight: 1.65, ["--d" as string]: 2 }}>{head.lead}</p>

      {/* enter — сыртқы қабатта: «шайқалу» біткенде карточка қайта «кірмеуі» үшін */}
      <div className="enter" style={{ ["--d" as string]: 3 }}>
      <form
        ref={formRef}
        className={"card auth" + (shaking ? " shake" : "")}
        onSubmit={submit}
        onAnimationEnd={() => setShaking(false)}
        noValidate
      >
        <div className="card-head">
          <div className="auth-tabs" role="tablist" aria-label="Кіру немесе тіркелу">
            <button type="button" role="tab" aria-selected={tab !== "register"} className={tab !== "register" ? "on" : ""} onClick={() => go("login")}>
              Кіру
            </button>
            <button type="button" role="tab" aria-selected={tab === "register"} className={tab === "register" ? "on" : ""} onClick={() => go("register")}>
              Тіркелу
            </button>
          </div>
          <span className="auth-file">{head.file}</span>
        </div>

        <div className="card-body">
          {sentTo ? (
            <div className="auth-sent">
              <p className="ok-line"><span className="ok pop">✓</span> хат жіберілді: <b>{sentTo}</b></p>
              <p className="muted" style={{ lineHeight: 1.65, marginTop: 10 }}>
                {tab === "register"
                  ? "Тіркелуді аяқтау үшін хаттағы сілтемені басыңыз. Хат келмесе, спам қалтасын тексеріңіз."
                  : "Егер бұл email тіркелген болса, хатта жаңа құпия сөз қоятын сілтеме бар. Хат келмесе, спам қалтасын тексеріңіз."}
              </p>
              <div className="actions" style={{ marginTop: 18 }}>
                {tab === "register" && (
                  <button type="button" className={"btn btn-ghost" + (busy ? " is-busy" : "")} onClick={resend} disabled={busy}>
                    {busy ? "жіберілуде…" : "Хатты қайта жіберу"}
                  </button>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => go("login")}>Кіру бетіне</button>
              </div>
            </div>
          ) : tab === "forgot" && !emailsEnabled ? (
            <div>
              <p className="muted" style={{ lineHeight: 1.65 }}>
                Хат жіберу әзірге қосылмаған. Құпия сөзді ауыстыру үшін ұйымдастырушыға тіркелген email-іңізді жазыңыз.
              </p>
              <button type="button" className="btn btn-ghost" style={{ marginTop: 18 }} onClick={() => go("login")}>Кіру бетіне</button>
            </div>
          ) : (
            <>
              {tab === "register" && (
                <>
                  <div className="row2">
                    <div className="field">
                      <label htmlFor="ln">Тегі</label>
                      <input id="ln" name="lastName" value={f.lastName} onChange={set("lastName")} autoComplete="family-name" maxLength={50} required {...inv("lastName")} />
                    </div>
                    <div className="field">
                      <label htmlFor="fn">Аты</label>
                      <input id="fn" name="firstName" value={f.firstName} onChange={set("firstName")} autoComplete="given-name" maxLength={50} required {...inv("firstName")} />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="un">Оқу орны</label>
                    <input id="un" name="university" value={f.university} onChange={set("university")} autoComplete="organization" maxLength={120}
                      placeholder="университет не колледж" required {...inv("university")} />
                  </div>
                  <div className="row2">
                    <div className="field">
                      <label htmlFor="co">Курс</label>
                      <select id="co" name="course" value={f.course} onChange={set("course")} required {...inv("course")}
                        style={f.course ? undefined : { color: "var(--dim)" }}>
                        <option value="" disabled>таңдаңыз</option>
                        {COURSES.map((c) => <option key={c} value={c} style={{ color: "var(--text)" }}>{c}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="ph">Телефон <span className="opt">· міндетті емес</span></label>
                      <input id="ph" name="phone" type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" inputMode="tel" maxLength={24}
                        placeholder="8 700 000 00 00" {...inv("phone")} />
                      {/* Нөмір қалай түсінілгенін көрсетеміз: студент қате тергенін бірден байқайды */}
                      <p className="hint">{phone ? formatPhone(phone) : ""}</p>
                    </div>
                  </div>
                </>
              )}

              <div className="field">
                <label htmlFor="em">Email</label>
                <input id="em" name="email" type="email" value={f.email} onChange={set("email")} autoComplete={tab === "register" ? "email" : "username"}
                  autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} placeholder="name@mail.kz" required {...inv("email")} />
              </div>

              {tab !== "forgot" && (
                <div className="field">
                  <label htmlFor="pw">Құпия сөз</label>
                  <input id="pw" name="password" type="password" value={f.password} onChange={set("password")} maxLength={128}
                    autoComplete={tab === "register" ? "new-password" : "current-password"} minLength={tab === "register" ? PASSWORD_MIN : undefined}
                    required {...inv("password")} />
                  {tab === "register" && <p className="hint muted-hint">кемінде {PASSWORD_MIN} таңба</p>}
                </div>
              )}

              <button className={"btn" + (busy ? " is-busy" : "")} type="submit" disabled={busy} style={{ width: "100%" }}>
                {busy ? "тексерілуде…" : tab === "login" ? "Кіру" : tab === "register" ? "Тіркелу" : "Сілтеме жіберу"}
              </button>
            </>
          )}

          <p className={"msg" + (msg?.err ? " err" : "")} role="status" aria-live="polite">{msg?.text ?? ""}</p>

          {unconfirmed && !sentTo && (
            <button type="button" className={"btn btn-ghost btn-sm" + (busy ? " is-busy" : "")} onClick={resend} disabled={busy} style={{ marginTop: 6 }}>
              Растау хатын қайта жіберу
            </button>
          )}

          {!sentTo && tab === "login" && (
            <p className="tiny auth-foot">
              <button type="button" className="link" onClick={() => go("forgot")}>Құпия сөзді ұмыттым</button>
              <span aria-hidden="true"> · </span>
              <button type="button" className="link" onClick={() => go("register")}>Тіркелмегенмін</button>
            </p>
          )}
          {!sentTo && tab === "register" && (
            <p className="tiny auth-foot" style={{ lineHeight: 1.7 }}>
              Көпшілікке тек «Тегі Аты» көрінеді. Email, телефон, оқу орны — тек ұйымдастырушыға.
            </p>
          )}
          {!sentTo && tab === "forgot" && emailsEnabled && (
            <p className="tiny auth-foot">
              <button type="button" className="link" onClick={() => go("login")}>← Кіру бетіне</button>
            </p>
          )}
        </div>
      </form>
      </div>
    </>
  );
}

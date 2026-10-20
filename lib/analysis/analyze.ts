/**
 * Build кезеңінің талдауы: «оқушы кодты өзі жазды ма, әлде сырттан (ЖИ, басқа оқушы) алды ма»
 * деген сұраққа қатысты БЕЛГІЛЕРДІ жинайды.
 *
 * МАҢЫЗДЫ: бұл үкім емес. Қысқа стандартты шешімнің авторын код бойынша сенімді анықтау мүмкін емес.
 * Нәтиже — күдік деңгейі және оның нақты себептері; шешімді адам (ұйымдастырушы) шығарады.
 */
import {
  FEATURE_LABEL, detectFeatures, distinctiveNames, exactTokens, similarity, structureTokens, tokenize, typedChars, type FeatureId,
} from "./pycode.ts";

export type Kind = "mcq" | "debug" | "code";
export type RoundLite = { id: string; idx: number; kind: Kind; started_at: string | null; ends_at: string | null };
export type TaskLite = { id: string; round_id: string; idx: number; title: string; points: number; starter_code: string | null; ai_refs?: string[] | null };
export type StudentLite = { id: string; full_name: string };
export type SubLite = { id: number; student_id: string; task_id: string; code: string | null; is_correct: boolean; points: number; created_at: string };

/** Жарыс кезінде браузер жинаған бақылау дерегі (lib/contest/telemetry.ts). Ескі жарыстарда жоқ. */
export type ActivityData = {
  hidden_count?: number; hidden_ms?: number; blur_count?: number; blur_ms?: number;
  tasks?: Record<string, { keys?: number; dels?: number; blocked?: number; checks?: number; check_fails?: number; pauses?: number; think_ms?: number; active_ms?: number }>;
};
export type ActivityRow = { student_id: string; round_id: string; data: ActivityData };

export type Options = { untaught: FeatureId[] };

export type Reason = { weight: number; text: string; task?: number };
export type Level = "high" | "medium" | "low";

export type TaskReport = {
  taskId: string; idx: number; title: string;
  solved: boolean; attempts: number; failedBefore: number;
  firstCorrectAt: string | null; seconds: number | null; typed: number; cpm: number | null;
  code: string | null;
  exact: { size: number; order: number; names: string[] } | null;
  structure: { size: number; order: number; names: string[]; common: boolean } | null;
  nearest: { name: string; sim: number; earlier: boolean }[];
  features: FeatureId[]; untaught: FeatureId[];
  aiRef: { sim: number; exact: boolean } | null;
  evolved: boolean;
  activity: NonNullable<ActivityData["tasks"]>[string] | null;
};

export type StudentReport = {
  studentId: string; name: string; rank: number;
  total: number; byKind: Record<Kind, { got: number; max: number }>;
  score: number; level: Level; reasons: Reason[]; tasks: TaskReport[];
  away: { hidden_count: number; hidden_ms: number; blur_count: number; blur_ms: number } | null;
};

export type Cluster = { taskIdx: number; taskTitle: string; kind: "exact" | "structure"; common: boolean; members: { name: string; at: string }[]; code: string };

export type Analysis = {
  overview: {
    participants: number; buildParticipants: number; solvers: Record<number, number>;
    levels: Record<Level, number>; hasActivity: boolean; hasAiRefs: boolean;
  };
  students: StudentReport[];
  clusters: Cluster[];
};

/** Күдік деңгейінің шектері. */
export const LEVEL_HIGH = 6;
export const LEVEL_MEDIUM = 3;
/** Бір тапсырмада осынша оқушы бірдей құрылым жазса — бұл «стандартты шешім», күдік емес. */
const commonThreshold = (solvers: number) => Math.max(4, Math.ceil(solvers * 0.2));
/** Бұдан қысқа код (таңба саны бойынша) кездейсоқ сәйкес келе береді — сәйкестік күдік саналмайды. */
const MIN_TOKENS = 30;
/** «Өте ұқсас» шегі. Қысқа стандартты шешімдер арасында 90% ұқсастық қалыпты, сондықтан шек жоғары. */
const NEAR_SIM = 0.96;

const ms = (iso: string) => Date.parse(iso);
const fmtPct = (x: number) => Math.round(x * 100) + "%";

export function analyze(input: {
  rounds: RoundLite[]; tasks: TaskLite[]; students: StudentLite[]; subs: SubLite[];
  activity?: ActivityRow[]; options: Options;
}): Analysis {
  const { rounds, tasks, students, subs, options } = input;
  const activity = input.activity ?? [];
  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const nameOf = new Map(students.map((s) => [s.id, s.full_name]));
  const kindOf = (t: TaskLite) => roundById.get(t.round_id)?.kind ?? "code";
  const buildTasks = tasks.filter((t) => kindOf(t) === "code").sort((a, b) => a.idx - b.idx);
  const buildRounds = new Set(buildTasks.map((t) => t.round_id));

  // ---------- оқушы × тапсырма бойынша жіберілімдер (уақыт ретімен) ----------
  const byST = new Map<string, SubLite[]>();
  for (const s of [...subs].sort((a, b) => ms(a.created_at) - ms(b.created_at) || a.id - b.id)) {
    const k = s.student_id + ":" + s.task_id;
    (byST.get(k) ?? byST.set(k, []).get(k)!).push(s);
  }
  const studentIds = [...new Set(subs.map((s) => s.student_id))];

  // ---------- ұпайлар (әр тапсырманың СОҢҒЫ жіберілімі есептеледі — лидербордтағыдай) ----------
  const maxByKind: Record<Kind, number> = { mcq: 0, debug: 0, code: 0 };
  const seenIdx = new Set<string>();
  for (const t of tasks) {
    const key = t.round_id + ":" + t.idx; // A/B нұсқаларын екі рет санамау
    if (seenIdx.has(key)) continue;
    seenIdx.add(key);
    maxByKind[kindOf(t)] += t.points;
  }
  const scoreOf = new Map<string, { total: number; byKind: Record<Kind, number>; lastCorrect: number }>();
  for (const sid of studentIds) {
    const byKind: Record<Kind, number> = { mcq: 0, debug: 0, code: 0 };
    let lastCorrect = 0;
    for (const t of tasks) {
      const list = byST.get(sid + ":" + t.id);
      const last = list?.[list.length - 1];
      if (last?.is_correct) {
        byKind[kindOf(t)] += last.points;
        lastCorrect = Math.max(lastCorrect, ms(last.created_at));
      }
    }
    scoreOf.set(sid, { total: byKind.mcq + byKind.debug + byKind.code, byKind, lastCorrect });
  }
  const ranked = [...studentIds].sort((a, b) => {
    const x = scoreOf.get(a)!, y = scoreOf.get(b)!;
    return y.total - x.total || (x.lastCorrect || Infinity) - (y.lastCorrect || Infinity) || (nameOf.get(a) ?? "").localeCompare(nameOf.get(b) ?? "");
  });
  const rankOf = new Map(ranked.map((id, i) => [id, i + 1]));

  // ---------- Build: әр оқушының шешімі ----------
  type Sol = { sid: string; code: string; at: number; struct: string[]; exact: string[]; features: FeatureId[]; distinct: string[] };
  const solutions = new Map<string, Sol[]>(); // taskId → шешкендер
  for (const t of buildTasks) {
    const list: Sol[] = [];
    for (const sid of studentIds) {
      const subsT = byST.get(sid + ":" + t.id);
      const last = subsT?.[subsT.length - 1];
      if (!last?.is_correct || !last.code) continue; // есептелген дұрыс шешім ғана салыстырылады
      const first = subsT!.find((s) => s.is_correct)!;
      const { tokens } = tokenize(last.code);
      list.push({ sid, code: last.code, at: ms(first.created_at), struct: structureTokens(tokens), exact: exactTokens(tokens), features: detectFeatures(tokens), distinct: distinctiveNames(tokens) });
    }
    solutions.set(t.id, list.sort((a, b) => a.at - b.at));
  }

  // ---------- кластерлер: дәл бірдей және құрылымы бірдей ----------
  const clusters: Cluster[] = [];
  const clusterOf = new Map<string, { exact: Sol[] | null; structure: Sol[] | null; common: boolean }>(); // sid:taskId
  for (const t of buildTasks) {
    const sols = solutions.get(t.id)!;
    const group = (key: (s: Sol) => string) => {
      const m = new Map<string, Sol[]>();
      for (const s of sols) (m.get(key(s)) ?? m.set(key(s), []).get(key(s))!).push(s);
      return [...m.values()].filter((g) => g.length > 1);
    };
    const exactGroups = group((s) => s.exact.join("\u0001"));
    const structGroups = group((s) => s.struct.join("\u0001"));
    const limit = commonThreshold(sols.length);
    for (const s of sols) clusterOf.set(s.sid + ":" + t.id, { exact: null, structure: null, common: false });
    for (const g of exactGroups) {
      for (const s of g) clusterOf.get(s.sid + ":" + t.id)!.exact = g;
      clusters.push({ taskIdx: t.idx, taskTitle: t.title, kind: "exact", common: g.length >= limit || g[0].struct.length < MIN_TOKENS, members: g.map((s) => ({ name: nameOf.get(s.sid) ?? "?", at: new Date(s.at).toISOString() })), code: g[0].code });
    }
    for (const g of structGroups) {
      const common = g.length >= limit || g[0].struct.length < MIN_TOKENS;
      for (const s of g) Object.assign(clusterOf.get(s.sid + ":" + t.id)!, { structure: g, common });
      // Дәл бірдей топпен толық сәйкес келсе, екі рет көрсетпейміз
      if (!exactGroups.some((e) => e.length === g.length && e.every((x) => g.includes(x)))) {
        clusters.push({ taskIdx: t.idx, taskTitle: t.title, kind: "structure", common, members: g.map((s) => ({ name: nameOf.get(s.sid) ?? "?", at: new Date(s.at).toISOString() })), code: g[0].code });
      }
    }
  }

  // ---------- ЖИ үлгі жауаптары (әкімші тапсырмаға қосса) ----------
  const aiRefs = new Map<string, { struct: string[]; exact: string[] }[]>();
  for (const t of buildTasks) {
    const refs = (t.ai_refs ?? []).filter((c) => typeof c === "string" && c.trim());
    if (refs.length) aiRefs.set(t.id, refs.map((c) => { const { tokens } = tokenize(c); return { struct: structureTokens(tokens), exact: exactTokens(tokens) }; }));
  }

  const actOf = new Map<string, ActivityData>();
  for (const a of activity) if (buildRounds.has(a.round_id)) actOf.set(a.student_id, a.data ?? {});

  // ---------- әр оқушының есебі ----------
  const reports: StudentReport[] = [];
  for (const sid of studentIds) {
    const sc = scoreOf.get(sid)!;
    const reasons: Reason[] = [];
    const taskReports: TaskReport[] = [];
    const act = actOf.get(sid) ?? null;
    let prevSolvedAt: Record<string, number> = {}; // round_id → осы оқушының алдыңғы дұрыс жіберілімі
    let touchedBuild = false;

    // Тапсырмаларды оқушы шешкен ретімен қараймыз — «қолда болған уақытты» дұрыс есептеу үшін
    const order = [...buildTasks].sort((a, b) => {
      const fa = byST.get(sid + ":" + a.id)?.find((s) => s.is_correct), fb = byST.get(sid + ":" + b.id)?.find((s) => s.is_correct);
      return (fa ? ms(fa.created_at) : Infinity) - (fb ? ms(fb.created_at) : Infinity);
    });

    for (const t of order) {
      const list = byST.get(sid + ":" + t.id) ?? [];
      if (list.length) touchedBuild = true;
      const last = list[list.length - 1];
      const first = list.find((s) => s.is_correct) ?? null;
      const solved = !!last?.is_correct;
      const round = roundById.get(t.round_id);
      const rep: TaskReport = {
        taskId: t.id, idx: t.idx, title: t.title, solved, attempts: list.length,
        failedBefore: first ? list.indexOf(first) : list.length,
        firstCorrectAt: first?.created_at ?? null, seconds: null, typed: 0, cpm: null,
        code: last?.code ?? null, exact: null, structure: null, nearest: [], features: [], untaught: [], aiRef: null,
        evolved: false, activity: act?.tasks?.[t.id] ?? null,
      };

      if (solved && first && last.code) {
        const sols = solutions.get(t.id)!;
        const me = sols.find((s) => s.sid === sid)!;
        const cl = clusterOf.get(sid + ":" + t.id)!;
        const others = (g: Sol[]) => g.filter((s) => s.sid !== sid).map((s) => nameOf.get(s.sid) ?? "?");

        // --- уақыт пен теру жылдамдығы ---
        const from = Math.max(round?.started_at ? ms(round.started_at) : 0, prevSolvedAt[t.round_id] ?? 0);
        const at = ms(first.created_at);
        rep.typed = typedChars(first.code ?? last.code, t.starter_code);
        if (from > 0 && at > from) {
          rep.seconds = Math.round((at - from) / 1000);
          rep.cpm = Math.round((rep.typed / rep.seconds) * 60);
          if (rep.typed >= 100 && rep.cpm >= 240) {
            reasons.push({ weight: 3, task: t.idx, text: `${rep.seconds} секундта ${rep.typed} таңба терген (${rep.cpm} таңба/мин) — қолмен теруге тым жылдам` });
          } else if (rep.typed >= 100 && rep.cpm >= 160) {
            reasons.push({ weight: 1.5, task: t.idx, text: `өте жылдам терген: ${rep.seconds} секундта ${rep.typed} таңба (${rep.cpm} таңба/мин)` });
          }
        }
        prevSolvedAt[t.round_id] = Math.max(prevSolvedAt[t.round_id] ?? 0, at);

        // --- басқа оқушылармен сәйкестік ---
        const tiny = me.struct.length < MIN_TOKENS;
        if (cl.exact) {
          const g = cl.exact, pos = g.findIndex((s) => s.sid === sid) + 1;
          rep.exact = { size: g.length, order: pos, names: others(g) };
          // Тым қысқа немесе жаппай кездесетін кодта дәл сәйкестік те аз мәнге ие.
          // Ал атаулар res, c, i сияқты жалпы болса — бұл құрылым сәйкестігінен күшті емес.
          const weak = tiny || g.length >= commonThreshold(sols.length);
          const generic = me.distinct.length === 0;
          const w = weak ? (pos === 1 ? 0 : 1) : generic ? (pos === 1 ? 1 : 3) : pos === 1 ? 2 : 5;
          const note = weak ? " — бірақ код өте қысқа не көп оқушыда бірдей"
            : generic ? " — атаулары жиі қолданылатын қысқа атаулар"
            : ` — ерекше атаулары да сәйкес: ${me.distinct.slice(0, 3).join(", ")}`;
          if (w > 0) reasons.push({ weight: w, task: t.idx, text: (pos === 1
            ? `коды ${others(g).join(", ")} кодымен атауларына дейін бірдей (бірінші болып жіберген)`
            : `коды ${others(g).join(", ")} кодымен атауларына дейін бірдей (${pos}-ші болып жіберген)`) + note });
        }
        if (cl.structure) {
          const g = cl.structure, pos = g.findIndex((s) => s.sid === sid) + 1;
          rep.structure = { size: g.length, order: pos, names: others(g), common: cl.common };
          if (!cl.exact) {
            if (cl.common) {
              if (pos > 1) reasons.push({ weight: 0.5, task: t.idx, text: `құрылымы ${g.length} оқушыда бірдей — көп тараған стандартты шешім` });
            } else {
              reasons.push({ weight: pos === 1 ? 1 : 3, task: t.idx, text: pos === 1
                ? `құрылымы ${others(g).join(", ")} кодымен бірдей, тек атаулары басқа (бірінші болып жіберген)`
                : `құрылымы ${others(g).join(", ")} кодымен бірдей, тек атаулары басқа (${pos}-ші болып жіберген)` });
            }
          }
        }
        // ең ұқсас кодтар (кластерден тыс)
        const sims = sols.filter((s) => s.sid !== sid && !(cl.structure?.includes(s)))
          .map((s) => ({ s, sim: similarity(me.struct, s.struct) }))
          .filter((x) => x.sim >= 0.8).sort((a, b) => b.sim - a.sim).slice(0, 3);
        rep.nearest = sims.map((x) => ({ name: nameOf.get(x.s.sid) ?? "?", sim: x.sim, earlier: x.s.at < me.at }));
        // «Өте ұқсас»: тек жеткілікті ұзын кодта және мұндай көршілер аз болғанда ғана белгі
        const closeCount = sols.filter((s) => s.sid !== sid && similarity(me.struct, s.struct) >= NEAR_SIM).length;
        const near = sims.find((x) => x.sim >= NEAR_SIM && x.s.at < me.at);
        if (near && !cl.structure && !tiny && closeCount < commonThreshold(sols.length)) {
          reasons.push({ weight: 1.5, task: t.idx, text: `коды ${nameOf.get(near.s.sid)} кодына ${fmtPct(near.sim)} ұқсас (ол ертерек жіберген)` });
        }

        // --- деңгейінен жоғары құрылымдар ---
        rep.features = me.features;
        rep.untaught = me.features.filter((f) => options.untaught.includes(f));
        if (rep.untaught.length) {
          reasons.push({ weight: 3, task: t.idx, text: `өтілмеген тақырып қолданылған: ${rep.untaught.map((f) => FEATURE_LABEL[f]).join("; ")}` });
        }
        if (me.features.includes("aiextras")) {
          reasons.push({ weight: 1, task: t.idx, text: "docstring не тип аннотациясы бар — жарыс шешіміне тән емес" });
        }

        // --- ЖИ үлгі жауабымен салыстыру ---
        const refs = aiRefs.get(t.id);
        if (refs) {
          let best = 0, exact = false;
          for (const r of refs) {
            best = Math.max(best, similarity(me.struct, r.struct));
            if (me.exact.join("\u0001") === r.exact.join("\u0001")) exact = true;
          }
          rep.aiRef = { sim: best, exact };
          // Үлгімен бірдей шыққан оқушы көп болса — бұл жай стандартты шешім
          const sameAsRef = sols.filter((s) => refs.some((r) => r.struct.join("\u0001") === s.struct.join("\u0001"))).length;
          const popular = sameAsRef >= commonThreshold(sols.length);
          if (exact) reasons.push({ weight: popular ? 1 : 4, task: t.idx, text: "коды ЖИ үлгі жауабымен атауларына дейін бірдей" + (popular ? " — бірақ бұл шешім көп оқушыда кездеседі" : "") });
          else if (best >= 0.999) reasons.push({ weight: popular ? 0.5 : 2, task: t.idx, text: "құрылымы ЖИ үлгі жауабымен бірдей (атаулары басқа)" + (popular ? " — көп тараған стандартты шешім" : "") });
        }

        // --- қорғайтын белгі: код қате нұсқадан біртіндеп түзетілген ---
        const failed = list.slice(0, list.indexOf(first)).filter((s) => s.code && s.code.trim());
        if (failed.length) {
          const f0 = structureTokens(tokenize(failed[0].code!).tokens);
          const sim = similarity(f0, me.struct);
          // Алғашқы қате нұсқа соңғы шешімнен өзгеше, бірақ мүлде бөтен код емес
          rep.evolved = sim >= 0.3 && sim < 1;
        }

        // --- бақылау дерегі (болса) ---
        const a = rep.activity;
        if (a) {
          if ((a.blocked ?? 0) >= 3) reasons.push({ weight: 3, task: t.idx, text: `қоюға (paste) ${a.blocked} рет тырысқан` });
          else if ((a.blocked ?? 0) >= 1) reasons.push({ weight: 2, task: t.idx, text: `қоюға (paste) ${a.blocked} рет тырысқан` });
          const keys = a.keys ?? 0, dels = a.dels ?? 0;
          if (keys >= 100 && dels / keys < 0.03 && (a.pauses ?? 0) === 0) {
            reasons.push({ weight: 1.5, task: t.idx, text: "кодты түзетусіз және кідіріссіз терген — дайын мәтінді көшіріп теруге тән" });
          }
          if (keys >= 100 && (a.think_ms ?? Infinity) < 15_000 && (a.check_fails ?? 0) === 0) {
            reasons.push({ weight: 0.5, task: t.idx, text: "тапсырманы ашқаннан кейін бірден тере бастаған" });
          }
        }
      }
      taskReports.push(rep);
    }
    if (!touchedBuild) continue; // Build-ке қатыспағандар талдауға кірмейді

    const solvedAll = taskReports.length > 0 && taskReports.every((r) => r.solved);

    // --- кезеңдер арасындағы сәйкессіздік ---
    const pct = (k: Kind) => (maxByKind[k] ? sc.byKind[k] / maxByKind[k] : 1);
    if (solvedAll) {
      const lowT = pct("mcq") < 0.5, lowD = pct("debug") < 0.5;
      if (lowT && lowD) reasons.push({ weight: 2, text: `Build-ті толық шешкен, бірақ Trace (${fmtPct(pct("mcq"))}) пен Debug (${fmtPct(pct("debug"))}) нәтижесі төмен` });
      else if (lowT || lowD) reasons.push({ weight: 1, text: `Build-ті толық шешкен, бірақ ${lowT ? `Trace (${fmtPct(pct("mcq"))})` : `Debug (${fmtPct(pct("debug"))})`} нәтижесі төмен` });
    }

    // --- беттен шығу (бақылау дерегі болса) ---
    let away: StudentReport["away"] = null;
    if (act) {
      away = { hidden_count: act.hidden_count ?? 0, hidden_ms: act.hidden_ms ?? 0, blur_count: act.blur_count ?? 0, blur_ms: act.blur_ms ?? 0 };
      const sec = Math.round(Math.max(away.hidden_ms, away.blur_ms) / 1000), cnt = Math.max(away.hidden_count, away.blur_count);
      if (sec >= 180 || cnt >= 8) reasons.push({ weight: 3, text: `Build кезінде жарыс бетінен ${cnt} рет шыққан, барлығы ${sec} секунд сыртта болған` });
      else if (sec >= 60 || cnt >= 3) reasons.push({ weight: 2, text: `Build кезінде жарыс бетінен ${cnt} рет шыққан, барлығы ${sec} секунд сыртта болған` });
    }

    // --- қорғайтын белгілер ---
    if (taskReports.some((r) => r.evolved)) reasons.push({ weight: -1, text: "қате нұсқасын біртіндеп түзетіп шешкен (өз жұмысына тән)" });
    if (taskReports.some((r) => (r.activity?.check_fails ?? 0) >= 1 && r.solved)) reasons.push({ weight: -0.5, text: "жібермес бұрын «Тексеру»-де қате шығып, түзеткен" });

    const score = Math.max(0, Math.round(reasons.reduce((a, r) => a + r.weight, 0) * 10) / 10);
    reports.push({
      studentId: sid, name: nameOf.get(sid) ?? "?", rank: rankOf.get(sid) ?? 0,
      total: sc.total, byKind: { mcq: { got: sc.byKind.mcq, max: maxByKind.mcq }, debug: { got: sc.byKind.debug, max: maxByKind.debug }, code: { got: sc.byKind.code, max: maxByKind.code } },
      score, level: score >= LEVEL_HIGH ? "high" : score >= LEVEL_MEDIUM ? "medium" : "low",
      reasons: reasons.sort((a, b) => b.weight - a.weight),
      tasks: taskReports.sort((a, b) => a.idx - b.idx), away,
    });
  }

  reports.sort((a, b) => b.score - a.score || a.rank - b.rank);
  const levels: Record<Level, number> = { high: 0, medium: 0, low: 0 };
  for (const r of reports) levels[r.level]++;
  const solvers: Record<number, number> = {};
  for (const t of buildTasks) solvers[t.idx] = solutions.get(t.id)!.length;

  return {
    overview: { participants: studentIds.length, buildParticipants: reports.length, solvers, levels, hasActivity: actOf.size > 0, hasAiRefs: aiRefs.size > 0 },
    students: reports,
    clusters: clusters.sort((a, b) => Number(a.common) - Number(b.common) || a.taskIdx - b.taskIdx || (a.kind === "exact" ? -1 : 1)),
  };
}

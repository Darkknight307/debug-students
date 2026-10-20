import { api } from "../client";
/**
 * Бақылау дерегі (тек браузерде). Жарыс кезінде мыналарды санайды:
 *   - оқушы беттен неше рет шықты және қанша уақыт сыртта болды (басқа қойынды / басқа қолданба);
 *   - қоюға (paste) неше рет тырысты;
 *   - кодты қалай терді: терілген және өшірілген таңбалар, ұзақ кідірістер, ойлану уақыты;
 *   - «Тексеру»-ді неше рет басты, оның нешеуі қате шықты.
 * Теру МАЗМҰНЫ жазылмайды — тек сандар. Дерек әкімшінің «ЖИ талдауы» бетінде қолданылады.
 *
 * Есептегіштер жинақталып өседі және localStorage-те сақталады (бетті жаңартса да жоғалмайды).
 * Оқушы браузерінде жиналатындықтан, техникалық сауатты оқушы оны бұрмалай алады —
 * сондықтан бұл дәлел емес, тек қосымша белгі.
 */

export type TaskActivity = {
  keys: number; dels: number; blocked: number; checks: number; check_fails: number;
  pauses: number; active_ms: number; think_ms: number | null;
};
export type RoundActivity = {
  hidden_count: number; hidden_ms: number; blur_count: number; blur_ms: number;
  tasks: Record<string, TaskActivity>;
};

const FLUSH_MS = 40_000;
const PAUSE_MS = 10_000; // осыдан ұзақ үзіліс «кідіріс» деп саналады
const emptyTask = (): TaskActivity => ({ keys: 0, dels: 0, blocked: 0, checks: 0, check_fails: 0, pauses: 0, active_ms: 0, think_ms: null });

export class Telemetry {
  private data: RoundActivity = { hidden_count: 0, hidden_ms: 0, blur_count: 0, blur_ms: 0, tasks: {} };
  private opened: Record<string, number> = {};
  private lastKey: Record<string, number> = {};
  private hiddenSince: number | null = null;
  private blurSince: number | null = null;
  private dirty = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly key: string;

  constructor(private readonly roundId: string) {
    this.key = "debug:act:" + roundId;
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) || "null");
      if (saved && typeof saved === "object" && saved.tasks) this.data = saved;
    } catch {}
  }

  private task(id: string): TaskActivity {
    return (this.data.tasks[id] ??= emptyTask());
  }
  private touch() {
    this.dirty = true;
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch {}
  }

  private onVisibility = () => {
    const now = Date.now();
    if (document.visibilityState === "hidden") {
      this.hiddenSince = now;
      this.data.hidden_count++;
      this.touch();
      this.flush(true); // бет жабылып бара жатса да дерек жетсін
    } else if (this.hiddenSince) {
      this.data.hidden_ms += now - this.hiddenSince;
      this.hiddenSince = null;
      this.touch();
    }
  };
  private onBlur = () => {
    this.blurSince = Date.now();
    this.data.blur_count++;
    this.touch();
  };
  private onFocus = () => {
    if (!this.blurSince) return;
    this.data.blur_ms += Date.now() - this.blurSince;
    this.blurSince = null;
    this.touch();
  };

  start() {
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("focus", this.onFocus);
    this.timer = setInterval(() => this.flush(), FLUSH_MS);
  }
  stop() {
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("focus", this.onFocus);
    if (this.timer) clearInterval(this.timer);
    this.flush(true);
  }

  /** Оқушы тапсырманы ашты — «ойлану уақыты» осыдан бастап есептеледі. */
  open(taskId: string) {
    this.opened[taskId] ??= Date.now();
    this.task(taskId);
  }
  /** Редактордағы бір өзгеріс: қанша таңба қосылды, қаншасы өшірілді. */
  edit(taskId: string, inserted: number, deleted: number) {
    const t = this.task(taskId), now = Date.now();
    if (t.think_ms === null && this.opened[taskId]) t.think_ms = now - this.opened[taskId];
    const last = this.lastKey[taskId];
    if (last) {
      const gap = now - last;
      if (gap >= PAUSE_MS) t.pauses++;
      t.active_ms += Math.min(gap, 5_000);
    }
    this.lastKey[taskId] = now;
    t.keys += inserted;
    t.dels += deleted;
    this.touch();
  }
  blocked(taskId: string) {
    this.task(taskId).blocked++;
    this.touch();
  }
  check(taskId: string, failed: boolean) {
    const t = this.task(taskId);
    t.checks++;
    if (failed) t.check_fails++;
    this.touch();
  }

  /** Жиналған деректі серверге жібереді. beacon=true — бет жабылар алдында сенімді жеткізу үшін. */
  flush(beacon = false) {
    if (!this.dirty) return;
    this.dirty = false;
    const body = JSON.stringify({ roundId: this.roundId, data: this.data });
    api.contest.activity(body, beacon).then((sent) => {
      if (!sent && !beacon) this.dirty = true; // келесі жолы қайта жіберіледі
    });
  }
}

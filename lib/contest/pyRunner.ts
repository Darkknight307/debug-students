/**
 * Pyodide worker-ін басқарады (тек браузерде).
 * - Бір уақытта бір тапсырма орындалады (кезек).
 * - Код шектен ұзақ орындалса (шексіз цикл), worker тоқтатылып, жаңасы ашылады;
 *   нәтиже «!ERR Timeout» болады. Pyodide файлдары браузер кэшінде қалғандықтан,
 *   қайта жүктелу тез өтеді.
 */

export type RunOutput = {
  results: string[];
  error: string | null;
  stdout: string;
  timedOut: boolean;
};

type Status = "idle" | "loading" | "ready" | "failed";

const LOAD_TIMEOUT_MS = 90_000;
export const TIMEOUT_ERR = "!ERR Timeout: код тым ұзақ орындалды (шексіз цикл болуы мүмкін)";

class PyRunner {
  private worker: Worker | null = null;
  private readyP: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private seq = 0;
  status: Status = "idle";
  private listeners = new Set<(s: Status) => void>();

  onStatus(fn: (s: Status) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private setStatus(s: Status) {
    this.status = s;
    this.listeners.forEach((f) => f(s));
  }

  /** Worker-ді ашып, Pyodide жүктелгенін күтеді. Қайта шақыру қауіпсіз. */
  load(): Promise<void> {
    if (this.readyP) return this.readyP;
    this.setStatus("loading");
    const w = new Worker("/pyodide-worker.js");
    this.worker = w;
    this.readyP = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Python жүктелмеді — интернетті тексеріп, бетті жаңартыңыз")), LOAD_TIMEOUT_MS);
      const onMsg = (e: MessageEvent) => {
        if (e.data?.type === "ready") {
          clearTimeout(timer);
          w.removeEventListener("message", onMsg);
          resolve();
        } else if (e.data?.type === "load-error") {
          clearTimeout(timer);
          w.removeEventListener("message", onMsg);
          reject(new Error("Python жүктелмеді — интернетті тексеріп, бетті жаңартыңыз"));
        }
      };
      w.addEventListener("message", onMsg);
      w.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Python жүктелмеді — интернетті тексеріп, бетті жаңартыңыз"));
      });
    }).then(
      () => this.setStatus("ready"),
      (e) => {
        this.reset();
        this.setStatus("failed");
        throw e;
      },
    );
    return this.readyP;
  }

  private reset() {
    this.worker?.terminate();
    this.worker = null;
    this.readyP = null;
  }

  /** `entry` функциясын әр кіріс үшін шақырады; нәтиже — repr жолдары немесе «!ERR …». */
  run(code: string, entry: string, inputs: unknown[][], timeoutMs = 6_000): Promise<RunOutput> {
    const job = this.queue.then(() => this.exec(code, entry, inputs, timeoutMs));
    this.queue = job.catch(() => {});
    return job;
  }

  private async exec(code: string, entry: string, inputs: unknown[][], timeoutMs: number): Promise<RunOutput> {
    await this.load();
    const w = this.worker!;
    const id = ++this.seq;
    return new Promise<RunOutput>((resolve) => {
      const timer = setTimeout(() => {
        w.removeEventListener("message", onMsg);
        this.reset();
        this.setStatus("loading");
        this.load().catch(() => {});
        resolve({ results: inputs.map(() => TIMEOUT_ERR), error: TIMEOUT_ERR, stdout: "", timedOut: true });
      }, timeoutMs);
      const onMsg = (e: MessageEvent) => {
        if (e.data?.type !== "result" || e.data.id !== id) return;
        clearTimeout(timer);
        w.removeEventListener("message", onMsg);
        resolve({ results: e.data.results, error: e.data.error, stdout: e.data.stdout, timedOut: false });
      };
      w.addEventListener("message", onMsg);
      w.postMessage({ type: "run", id, code, entry, inputs });
    });
  }
}

let instance: PyRunner | null = null;

export function pyRunner(): PyRunner {
  if (typeof window === "undefined") throw new Error("pyRunner тек браузерде жұмыс істейді");
  return (instance ??= new PyRunner());
}

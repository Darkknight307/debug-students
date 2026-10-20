/* DEBUG · Python орындаушы. Pyodide оқушының өз браузерінде жұмыс істейді —
 * сервер кодты орындамайды. Шексіз цикл болса, негізгі бет бұл worker-ді
 * тоқтатып, жаңасын ашады (lib/contest/pyRunner.ts). */

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.5/full/";
const MAX_OUT = 4000;

importScripts(PYODIDE + "pyodide.js");

let out = "";
const sink = (s) => {
  if (out.length < MAX_OUT) out += s + "\n";
};

const HARNESS = `
import copy, json, sys, traceback

def _debug_where(e):
    if isinstance(e, SyntaxError) and e.filename == "<code>" and e.lineno:
        return e.lineno
    line = None
    for fr in traceback.extract_tb(e.__traceback__):
        if fr.filename == "<code>":
            line = fr.lineno
    return line

def _debug_err(e):
    line = _debug_where(e)
    msg = type(e).__name__ + (": " + str(e) if str(e) else "")
    return "!ERR " + msg + (" (жол " + str(line) + ")" if line else "")

def _debug_run(code, entry, inputs_json):
    inputs = json.loads(inputs_json)
    ns = {"__name__": "__debug__"}
    try:
        exec(compile(code, "<code>", "exec"), ns)
    except BaseException as e:
        err = _debug_err(e)
        return json.dumps({"error": err, "results": [err] * len(inputs)})
    fn = ns.get(entry)
    if not callable(fn):
        err = "!ERR NameError: '" + entry + "' функциясы табылмады"
        return json.dumps({"error": err, "results": [err] * len(inputs)})
    results = []
    for args in inputs:
        try:
            r = repr(fn(*copy.deepcopy(args)))
            results.append(r if len(r) <= 1900 else r[:1900] + "…")
        except BaseException as e:
            results.append(_debug_err(e))
    return json.dumps({"error": None, "results": results})
`;

const ready = (async () => {
  const t0 = Date.now();
  const py = await loadPyodide({ indexURL: PYODIDE, stdout: sink, stderr: sink });
  py.setStdin({ error: true }); // input() жарыста қолданылмайды
  py.runPython(HARNESS);
  self.postMessage({ type: "ready", ms: Date.now() - t0 });
  return py;
})().catch((e) => {
  self.postMessage({ type: "load-error", message: String(e && e.message || e) });
  throw e;
});

self.onmessage = async ({ data }) => {
  if (!data || data.type !== "run") return;
  const { id, code, entry, inputs } = data;
  let py;
  try {
    py = await ready;
  } catch {
    return;
  }
  out = "";
  try {
    const run = py.globals.get("_debug_run");
    const res = JSON.parse(run(String(code), String(entry), JSON.stringify(inputs)));
    run.destroy();
    self.postMessage({ type: "result", id, results: res.results, error: res.error, stdout: out });
  } catch (e) {
    const err = "!ERR " + String(e && e.message || e).split("\n").slice(-2).join(" ").trim();
    self.postMessage({ type: "result", id, results: inputs.map(() => err), error: err, stdout: out });
  }
};

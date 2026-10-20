// openapi.yml мен app/api/**/route.ts бір-бірінен алшақтамасын: әр жол+әдіс екі жақта да болуы керек.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const METHODS = ["get", "post", "put", "patch", "delete"];

function contract(): Set<string> {
  const out = new Set<string>();
  let path: string | null = null;
  for (const line of readFileSync("openapi.yml", "utf8").split("\n")) {
    const p = /^  (\/api\/[^:]+):\s*$/.exec(line);
    if (p) { path = p[1]; continue; }
    if (/^\S/.test(line)) path = null;
    const m = /^    (get|post|put|patch|delete):/.exec(line);
    if (path && m) out.add(`${m[1].toUpperCase()} ${path}`);
  }
  return out;
}

function routes(dir = "app/api"): Set<string> {
  const out = new Set<string>();
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      for (const r of routes(full)) out.add(r);
    } else if (name === "route.ts") {
      const url = "/" + relative("app", dir).split(sep).join("/").replace(/\[(\w+)\]/g, "{$1}");
      if (url.startsWith("/api/test-hooks")) continue; // тек тест үшін, келісімшартта жоқ (E2E_TEST_HOOKS)
      const src = readFileSync(full, "utf8");
      for (const m of METHODS) if (new RegExp(`export (async function|const) ${m.toUpperCase()}\\b`).test(src)) out.add(`${m.toUpperCase()} ${url}`);
    }
  }
  return out;
}

test("openapi.yml-дағы әр жол үшін маршрут бар", () => {
  const r = routes();
  assert.deepEqual([...contract()].filter((x) => !r.has(x)), []);
});

test("әр маршрут openapi.yml-да сипатталған", () => {
  const c = contract();
  assert.deepEqual([...routes()].filter((x) => !c.has(x)), []);
});

test("келісімшарт бос емес (талдаушы жұмыс істейді)", () => {
  assert.ok(contract().size >= 30, `тек ${contract().size} жол табылды`);
});

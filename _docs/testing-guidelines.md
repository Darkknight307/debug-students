# Testing guidelines

## Levels

| Level | Where | Runs with | What it proves |
|---|---|---|---|
| Unit | `tests/**/unit.test.mts` | `npm test` | pure logic: validation, rules, ranking, sessions, password hashing, analysis |
| Store contract | `tests/store/contract.test.mts` | `npm test` | `MemoryStore` and `PrismaStore` on PostgreSQL behave the same, including races (two requests at once) |
| Data import | `tests/store/import.test.mts` | `npm test` | old SQLite/Turso data → empty Postgres, every type, one transaction, sequence |
| Contract | `tests/contract/openapi.test.mts` | `npm test` | `openapi.yml` and the route handlers list the same paths and methods |
| API e2e | `tests/contest/e2e.mjs`, `tests/auth/e2e.sh`, `tests/admin/e2e.mjs` (runner `tests/e2e.sh`) | `npm run test:e2e` (one mode: `E2E_ONLY=postgres`) | the real Next.js server end to end in two modes: memory, Postgres |
| Browser e2e (Playwright) | `e2e/features/NN-*.spec.ts` (one per feature, `e2e-test` issues), `e2e/fixtures.ts` | `npm run test:pw:compose` | real Chromium (desktop 1280 px + mobile 375 px) against the Docker image + Postgres |
| Integration | `e2e/integration/stack.spec.ts`, `tests/health/unit.test.mts` | `npm run test:pw:compose`, `npm test` | one container serves static + API, Postgres round trip, health, no answer keys |
| Manual | browser (desktop + 375 px) | a person / QA | what tests miss: layout, animations, copy, flows — bugs become `user-test-bug` issues |

`npm test` runs every `tests/**/*.test.mts` through `tsx` with `node:test`. Postgres tests use `TEST_DATABASE_URL`
(default `postgresql://debug:debug@localhost:5432/debug`, e.g. `npm run db:up`); each run creates its own schema
(`tests/pgSchema.mts`) and drops it, so the developer's data is never touched. CI runs everything on every push.

## Rules

- Test through the public surface: HTTP for e2e, the `Store` interface for store tests, exported functions for units.
- Every **refusal** test asserts the status code **and** that nothing changed (dump the store / re-fetch and compare).
- Name tests after behaviour, in Kazakh or English: `test("студент әкімші API-іне кіре алмайды", …)`.
- Never rely on the real clock for logic: pass `now` explicitly (services take `now = Date.now()`).
- E2E servers each get their own port **and** `NEXT_DIST_DIR`; two servers sharing `.next` break each other.
- E2E servers get explicit values for behaviour-changing env (`CRON_SECRET`, `AUTH_EMAILS_ENABLED`, `POSTGRES_PRISMA_URL`): Next.js loads the developer's `.env` into them otherwise (#63). The Playwright stack never sees `.env` (`compose.e2e.yml`).
- Seed e2e data through the test hooks (`/api/test-hooks/seed`), which exist only with `E2E_TEST_HOOKS=1`.

## Playwright

- Import `test`/`expect` from `e2e/fixtures.ts`: every test starts from a reset database (auto fixture; the reset also
  clears rate-limit counters) and seeds its own data in **one** `hooks.seed(...)` call — seed replaces whole tables.
- Find elements by role, label, placeholder or visible Kazakh text; CSS classes only where the page has nothing else.
- Code goes into CodeMirror with `typeCode()` (≤ 40-character chunks, the editor's own indentation removed).
- Wait at least 300 ms between two answers to the same task — the server answers 429 «Тым жиі» faster than 250 ms.
- Never add headers such as `X-Forwarded-For` to the browser context: they break the CORS requests to the Pyodide CDN.
- Desktop-only specs are listed in `playwright.config.ts`; phone-only checks are named «375 px» and also run on desktop.

## Test data

- Invented names only (`Серіков Айдос`, `Қайрат Бота`), emails on `@mock.test` (the site rejects dotless domains such
  as `a@test`), passwords like `fixture-pass-1`. Never real students, never real credentials.
- Code typed into the editor in a browser test goes in chunks of at most 40 characters (longer single inputs are blocked
  by the anti-paste guard).

## After running

`next build` and dev servers with `NEXT_DIST_DIR` add `node_modules/.cache/...` entries to `tsconfig.json` → remove them
before committing.

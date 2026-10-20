# Testing guidelines

## Levels

| Level | Where | Runs with | What it proves |
|---|---|---|---|
| Unit | `tests/**/unit.test.mts` | `npm test` | pure logic: validation, rules, ranking, sessions, password hashing, analysis |
| Store contract | `tests/store/contract.test.mts` | `npm test` | `MemoryStore` and `PrismaStore` behave the same (every case runs on both) |
| Contract | `tests/contract/openapi.test.mts` | `npm test` | `openapi.yml` and the route handlers list the same paths and methods |
| E2E | `tests/e2e/*.mjs` | `npm run test:e2e` | the real Next.js server end to end, on `DB_DRIVER=memory` and on a temporary SQLite file |
| Manual | browser (desktop + 375 px) | a person / QA | what tests miss: layout, animations, copy, flows — bugs become `user-test-bug` issues |

`npm test` runs every `tests/**/*.test.mts` through `tsx` with `node:test`.

## Rules

- Test through the public surface: HTTP for e2e, the `Store` interface for store tests, exported functions for units.
- Every **refusal** test asserts the status code **and** that nothing changed (dump the store / re-fetch and compare).
- Name tests after behaviour, in Kazakh or English: `test("студент әкімші API-іне кіре алмайды", …)`.
- Never rely on the real clock for logic: pass `now` explicitly (services take `now = Date.now()`).
- E2E servers each get their own port **and** `NEXT_DIST_DIR`; two servers sharing `.next` break each other.
- Seed e2e data through the test hooks (`/api/__test/seed`), which exist only with `E2E_TEST_HOOKS=1`.

## Test data

- Invented names only (`Серіков Айдос`, `Қайрат Бота`), emails on `@mock.test` (the site rejects dotless domains such
  as `a@test`), passwords like `fixture-pass-1`. Never real students, never real credentials.
- Code typed into the editor in a browser test goes in chunks of at most 40 characters (longer single inputs are blocked
  by the anti-paste guard).

## After running

`next build` and dev servers with `NEXT_DIST_DIR` add `node_modules/.cache/...` entries to `tsconfig.json` → remove them
before committing.

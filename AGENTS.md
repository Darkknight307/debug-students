# AGENTS.md

Context for coding agents. Read this at the start of every session.

**DEBUG · Студенттер** — an online coding contest for university/college students. Three rounds: **Trace**
(read code, multiple choice), **Debug** (fix one line), **Build** (write a function). Python runs in the browser
(Pyodide); hidden tests are checked on the server; a live leaderboard and an operator/admin panel run the contest.
The UI is in Kazakh.

Stack: one **Next.js 15** app (App Router, React 19, TypeScript). The frontend talks to the backend only through
`lib/client` (`api` object, http or **mockService**). The backend is Next.js route handlers → services in
`lib/server` → a **`Store` interface** with two implementations: `MemoryStore` and `PrismaStore`
(**Prisma ORM + SQLite**). Contract: `openapi.yml`.

## Commands

| What | Command |
|---|---|
| Install | `npm install` |
| Dev server, real backend (SQLite) | `npm run dev` → http://localhost:3000 |
| Dev server, UI only on mocks | `npm run dev:mock` → http://localhost:3000 |
| Unit + store contract tests | `npm test` |
| One test file | `npx tsx --test tests/store/contract.test.ts` |
| E2E suites (real Next.js server, memory and SQLite) | `npm run test:e2e` |
| Type check + production build | `npm run build` |
| Apply migrations / create a new one | `npm run db:deploy` / `npm run db:migrate -- --name <name>` (schema: `prisma/schema.prisma`) |
| Seed admin + first contest | `npm run db:seed` (reads `ADMIN_EMAIL`, `ADMIN_PASSWORD`) |

Keep this table in sync with `package.json`. Local config lives in `.env` (copy `.env.example`).

## Rules

- Work on **one GitHub issue at a time**. Read its acceptance criteria (and the QA test cases) before starting and before handing over.
- Every commit message references the issue: `Add PrismaStore (#39)`.
- **Never add a dependency without asking.** Runtime deps: next, react, react-dom, @prisma/client, CodeMirror packages; dev: prisma, tsx, typescript.
- Every change ships with tests; `npm test` and `npm run test:e2e` must pass, `npm run build` must succeed.
- **Relative imports only** (no `@/` alias).
- Pages and components never call `fetch` or a database directly — only `lib/client` (`api`).
- Route handlers never touch Prisma directly — only services in `lib/server` and `getStore()`.
- Answer keys (`correct`, `solution_code`, `tests_hidden`) never leave the server except through `/api/admin/*`.
- Test data uses invented names and `@mock.test` emails. No real student data, no secrets in the repo.
- After `next build` or a dev server with `NEXT_DIST_DIR`, remove `node_modules/.cache/...` entries that Next adds to `tsconfig.json` `include`.

## Documents

- `_docs/process.md` — how work is organised (issues, labels, roles, bug flow). **Read before picking up any issue.**
- `_docs/task-template.md` — the structure of every groomed issue and bug report.
- `_docs/team/pm.md`, `qa.md`, `software-engineer.md`, `qa-engineer.md` — read the one for the role you are playing.
- `_docs/plan.md` — the product spec from the brainstorm (`chat-brainstorm.md`). Read when a requirement is unclear.
- `_docs/decisions.md` — stack and architecture decisions. Read before adding files, tables or libraries.
- `_docs/design.md` — design references (tokens, components, logo, screenshots). Read before touching UI.
- `_docs/testing-guidelines.md` — how to write tests. Read when writing or reviewing tests.
- `openapi.yml` — the HTTP contract. Read when touching an endpoint or `lib/client`.
- `docs/debug-2026-design.md` — the original full design specification.

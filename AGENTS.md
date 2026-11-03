# AGENTS.md

Context for coding agents. Read this at the start of every session.

**DEBUG · Студенттер** — an online coding contest for university/college students. Three rounds: **Trace**
(read code, multiple choice), **Debug** (fix one line), **Build** (write a function). Python runs in the browser
(Pyodide); hidden tests are checked on the server; a live leaderboard and an operator/admin panel run the contest.
The UI is in Kazakh.

Stack: one **Next.js 15** app (App Router, React 19, TypeScript). The frontend talks to the backend only through
`lib/client` (`api` object, http or **mockService**). The backend is Next.js route handlers → services in
`lib/server` → a **`Store` interface** with two implementations: `MemoryStore` and `PrismaStore`
(**Prisma ORM + PostgreSQL**). Contract: `openapi.yml`. One **Docker** image (`Dockerfile`, Next.js standalone: static
frontend + API), **Compose** (`compose.yml` app + Postgres), **Playwright** e2e against Compose, **GitHub Actions**
CI/CD, production on Vercel + Neon and on AWS (`infra/aws`, CloudFormation).

## Commands

| What | Command |
|---|---|
| Install | `npm install` |
| Local PostgreSQL (Compose `db`, 127.0.0.1:`DB_PORT`) | `npm run db:up` |
| Dev server, real backend (Postgres from `.env` `DATABASE_URL`) | `npm run dev` → http://localhost:3000 |
| Dev server, UI only on mocks | `npm run dev:mock` → http://localhost:3000 |
| Whole stack in Docker (app + Postgres) | `docker compose up --build` → http://localhost:3000 |
| Unit + store contract + import tests (need Postgres at `TEST_DATABASE_URL`) | `npm test` |
| One test file | `npx tsx --test tests/store/contract.test.mts` |
| API e2e suites (real Next.js server, memory and postgres) | `npm run test:e2e` |
| Playwright e2e against Docker Compose (build → up → test → down) | `npm run test:pw:compose` (one spec: `npm run test:pw:compose -- e2e/features/02-register.spec.ts`) |
| Playwright against an already running stack | `npm run test:pw` (`E2E_BASE_URL`, default http://localhost:3300) |
| Type check + production build | `npm run build` |
| Apply migrations / create a new one | `npm run db:deploy` / `npm run db:migrate -- --name <name>` (schema: `prisma/schema.prisma`) |
| Seed admin + first contest | `npm run db:seed` (reads `ADMIN_EMAIL`, `ADMIN_PASSWORD` from `.env`; Node 22.9+) |
| Copy old data into Postgres | `npm run db:import -- --from <libsql://… \| file:….db \| export.json> [--to url] [--export file.json]` |
| AWS stack / deploy / data | `infra/aws/README.md` (`aws cloudformation deploy …`, `infra/aws/deploy.sh`, `infra/aws/import-data.sh`) |

Keep this table in sync with `package.json`. Local config lives in `.env` (copy `.env.example`).

## Rules

- Work on **one GitHub issue at a time**. Read its acceptance criteria (and the QA test cases) before starting and before handing over.
- Every commit message references the issue: `Add PrismaStore (#39)`.
- **Never add a dependency without asking.** Runtime deps: next, react, react-dom, @prisma/client, prisma, CodeMirror packages; dev: tsx, typescript, @playwright/test.
- Every change ships with tests; `npm test`, `npm run test:e2e` and `npm run test:pw:compose` must pass, `npm run build` must succeed. CI (`.github/workflows/ci.yml`) runs all of them on every push.
- **Relative imports only** (no `@/` alias).
- Pages and components never call `fetch` or a database directly — only `lib/client` (`api`).
- Route handlers never touch Prisma directly — only services in `lib/server` and `getStore()`.
- Answer keys (`correct`, `solution_code`, `tests_hidden`) never leave the server except through `/api/admin/*`.
- Test data uses invented names and `@mock.test` emails. No real student data, no secrets in the repo.
- After `next build` or a dev server with `NEXT_DIST_DIR`, remove `node_modules/.cache/...` entries that Next adds to `tsconfig.json` `include`.
- Module-level state is per route bundle in Next.js: anything shared between routes (store, caches, rate limits) lives on `globalThis` (#60, #84).
- Infrastructure stays inside the AWS free account: never add paid resources (NAT, load balancer, RDS, detailed monitoring) to `infra/aws/stack.yml`.

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

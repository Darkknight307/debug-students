# DEBUG · Студенттер

[![CI/CD](https://github.com/Darkknight307/debug-students/actions/workflows/ci.yml/badge.svg)](https://github.com/Darkknight307/debug-students/actions/workflows/ci.yml)

Online coding contest for students: three timed rounds — **Trace** (read code), **Debug** (fix one line),
**Build** (write a function). Python runs in the browser (Pyodide), hidden tests are checked on the server,
live leaderboard, operator/admin panel, AI/copy analysis (never a verdict). UI in Kazakh.

**Stack:** Next.js 15 (App Router, React 19, TypeScript) · **Prisma ORM + PostgreSQL** · `openapi.yml` contract ·
one Docker image (static frontend + API) · Docker Compose · Playwright · GitHub Actions · AWS CloudFormation.

**Live:**
- https://debug-students.vercel.app — Vercel + **Neon Postgres** (deploys every push to `main` through the Vercel GitHub integration).
- AWS — EC2 free tier, the same Docker image + Postgres + Caddy HTTPS, deployed by CI on every push to `main`
  (address: repository variable `SITE_URL`, see [`infra/aws/README.md`](infra/aws/README.md)).

## Run with Docker (everything in containers)

```bash
cp .env.example .env              # first time only: set SESSION_SECRET (≥ 32 chars), ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up --build         # app + PostgreSQL → http://localhost:3000 (admin: /admin)
docker compose down               # stop, data stays in the pgdata volume  ·  docker compose down -v — delete the data
```

The app container applies migrations on start and, with `SEED_ON_START=1` (default in `.env.example`), creates the
admin and the first contest. `GET /api/health` → `{"ok":true,"db":"up","version":"…"}`.

## Run for development (hot reload)

Node 22.9+, Docker for the database (or any PostgreSQL 15+).

```bash
npm install
cp .env.example .env          # first time only (do not overwrite an existing .env)
npm run db:up                 # PostgreSQL from compose.yml on 127.0.0.1:${DB_PORT:-5432} (port busy? DB_PORT=5433 in .env)
npm run db:seed               # admin + «DEBUG · Студенттер» contest with 16 tasks
npm run dev                   # applies migrations, http://localhost:3000
```

UI only, no backend: `npm run dev:mock` (MOCK badge; demo accounts `demo@mock.test` / `demo-pass-1`,
admin `admin@mock.test` / `admin-pass-1`, stored only in the browser).

## Test

```bash
npm test                 # unit + frontend mock client + openapi contract + store contract (Memory, Postgres) + data import
npm run test:e2e         # API e2e (contest, auth, admin) on the real server: memory and postgres
npm run test:pw:compose  # Playwright: builds the image, starts app + Postgres, 15 feature specs + integration, desktop + 375 px
npm run build            # type check + production build
```

Tests that need Postgres use `TEST_DATABASE_URL` (default `postgresql://debug:debug@localhost:5432/debug`); every run
creates its own schema and drops it afterwards.

## CI/CD

`.github/workflows/ci.yml` on every push and pull request: **unit** (with a Postgres service) · **api-e2e** ·
**build** · **docker-e2e** (image + Compose + Playwright, report uploaded on failure) · **infra-lint** (cfn-lint).
On a push to `main` that passes everything, **deploy** assumes an AWS role through GitHub OIDC (no stored keys), pushes
the `linux/amd64` image to ECR, rolls it out over SSM and waits until `/api/health` reports the commit SHA. Until the
repository variables from `infra/aws/README.md` exist, the deploy job is skipped with a notice.

## Deploy

- **Vercel + Neon:** Vercel → project → Storage → Create Database → **Neon** → Connect (adds `DATABASE_URL`,
  `DATABASE_URL_UNPOOLED`, `POSTGRES_PRISMA_URL`). Project env: `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
  `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`. The build (`scripts/vercel-build.sh`) migrates through the unpooled URL, seeds
  and builds; without a database URL it stops with a clear error.
- **AWS (CloudFormation):** [`infra/aws/README.md`](infra/aws/README.md) — create/delete the stack, CI variables,
  cost guardrails.
- **Existing data → Postgres:** `npm run db:import -- --from <libsql://… | file:….db | export.json>` (empty target,
  one transaction, row counts compared); `--export file.json` to carry it to AWS.

## Architecture

```
browser ── pages (app/) → lib/client api ─┬─ http.ts → /api/* route handlers → lib/server services → Store
                                          └─ mock/   (mockService)                       ├─ MemoryStore
                                                                                         └─ PrismaStore → PostgreSQL
Docker image (Dockerfile): Next.js standalone server = public/ + .next/static + API, migrations on start
compose.yml: app + postgres:17 (volume) · compose.e2e.yml: test hooks for Playwright/CI
AWS (infra/aws): EC2 t3.micro → Caddy (HTTPS) → app (ECR) → Postgres (EBS) · GitHub OIDC + SSM deploys
```

## AI-native workflow

1. `chat-brainstorm.md` — the brainstorm chat before building.
2. `_docs/plan.md` (spec), `_docs/decisions.md` (stack + architecture), `_docs/design.md` (design references).
3. `_docs/tasks.md` → GitHub issues: `mvp`, `post-mvp`, `user-test-bug`, `e2e-test`, iteration labels `iter-0` … `iter-6`.
4. Roles: `_docs/team/pm.md` (grooming), `qa.md` (test cases), `software-engineer.md`, `qa-engineer.md` (verifies, closes).
5. Iterations: frontend + mockService → `openapi.yml` → in-memory backend → SQLite (Prisma) → connect →
   **test, containerise and deploy** (PostgreSQL, Docker, Compose, Playwright per feature, CI/CD, AWS).
6. Bugs found by running the app are `user-test-bug` issues (Goal + Description → PM → QA test cases → fix → QA closes).

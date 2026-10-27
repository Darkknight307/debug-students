# DEBUG · Студенттер

Online coding contest for students: three timed rounds — **Trace** (read code), **Debug** (fix one line),
**Build** (write a function). Python runs in the browser (Pyodide), hidden tests are checked on the server,
live leaderboard, operator/admin panel, AI/copy analysis (never a verdict). UI in Kazakh.

**Stack:** Next.js 15 (App Router, React 19, TypeScript) · **Prisma ORM + SQLite** · `openapi.yml` contract.

**Live:** https://debug-students.vercel.app — Vercel + **Turso** (libSQL, hosted SQLite) through the same Prisma
schema and migrations (`@prisma/adapter-libsql`). Data persists across deploys and instances. Locally the app uses
a plain SQLite file.

## Run

Node 22.9+.

```bash
npm install
cp .env.example .env          # first time only (do not overwrite an existing .env): set SESSION_SECRET (≥ 32 chars), ADMIN_EMAIL, ADMIN_PASSWORD
npm run db:seed               # admin + «DEBUG · Студенттер» contest with 16 tasks
npm run dev                   # applies migrations, http://localhost:3000 (admin: /admin)
```

UI only, no backend: `npm run dev:mock` (MOCK badge; demo accounts `demo@mock.test` / `demo-pass-1`,
admin `admin@mock.test` / `admin-pass-1`, stored only in the browser).

## Deploy (Vercel + Turso)

1. Vercel → project → **Storage → Create Database → Turso → Connect** (adds `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`).
2. Project env: `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`.
3. `npx vercel deploy --prod --yes` — the build (`npm run vercel-build`) applies migrations to Turso
   (`scripts/db-migrate-libsql.ts`), seeds the admin and the first contest, then builds. Without Turso it stops with a clear error.

## Test

```bash
npm test           # unit + store contract (MemoryStore, PrismaStore on SQLite, PrismaStore on libSQL) + openapi contract
npm run test:e2e   # contest + auth + admin e2e on the real server: memory, SQLite file, libSQL adapter
npm run build
```

## Architecture

```
pages (app/) → lib/client api ─┬─ http.ts → /api/* route handlers → lib/server services → Store
                               └─ mock/   (mockService)                       ├─ MemoryStore
                                                                              └─ PrismaStore → SQLite
```

## AI-native workflow

1. `chat-brainstorm.md` — the brainstorm chat before building.
2. `_docs/plan.md` (spec), `_docs/decisions.md` (stack + architecture), `_docs/design.md` (design references).
3. `_docs/tasks.md` → GitHub issues: `mvp`, `post-mvp`, `user-test-bug`, iteration labels `iter-0` … `iter-5`.
4. Roles: `_docs/team/pm.md` (grooming), `qa.md` (test cases), `software-engineer.md`, `qa-engineer.md` (verifies, closes).
5. Iterations: frontend + mockService → `openapi.yml` → in-memory backend → SQLite (Prisma) → connect.
6. Bugs found by running the app are `user-test-bug` issues (Goal + Description → PM → QA test cases → fix → QA closes).

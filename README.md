# DEBUG · Студенттер

Online coding contest for students: three timed rounds — **Trace** (read code), **Debug** (fix one line),
**Build** (write a function). Python runs in the browser (Pyodide), hidden tests are checked on the server,
live leaderboard, operator/admin panel, AI/copy analysis (never a verdict). UI in Kazakh.

**Stack:** Next.js 15 (App Router, React 19, TypeScript) · **Prisma ORM + SQLite** · `openapi.yml` contract.

**Live demo:** https://debug-students.vercel.app — runs on Vercel with a *temporary* SQLite file: the build seeds
`prisma/demo.db` (migrations + first contest), each server instance copies it to `/tmp` on the first request.
Data lives until the instance restarts; a persistent production database is post-MVP (#51).

## Run

```bash
npm install
cp .env.example .env          # set SESSION_SECRET (≥ 32 chars), ADMIN_EMAIL, ADMIN_PASSWORD
npm run db:seed               # admin + «DEBUG · Студенттер» contest with 16 tasks
npm run dev                   # applies migrations, http://localhost:3000 (admin: /admin)
```

UI only, no backend: `npm run dev:mock` (MOCK badge; demo accounts `demo@mock.test` / `demo-pass-1`,
admin `admin@mock.test` / `admin-pass-1`, stored only in the browser).

## Test

```bash
npm test           # 70 unit + store contract (MemoryStore and PrismaStore/SQLite) + openapi contract tests
npm run test:e2e   # contest + auth + admin e2e on the real server, on DB_DRIVER=memory and on SQLite
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

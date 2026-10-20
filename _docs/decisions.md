# Decisions

Architecture and stack decisions taken after the brainstorm. The agent was asked for options with tradeoffs first;
the student chose «whichever is faster to build».

## Stack options considered

| Option | Pros | Cons |
|---|---|---|
| A. Keep the **Next.js** full-stack app; route handlers + services; **Prisma + SQLite** | Reuses all UI and contest logic; one language; Prisma is DBMS-agnostic (SQLite → Postgres is one line); fastest | Next.js route handlers are less explicit than a separate API server |
| B. Separate backend (Express/FastAPI + SQLite) and a React SPA | Very explicit frontend/backend split | Rewrite of every page and the contest logic; two runtimes; slowest |
| C. Keep Supabase (Postgres + Auth) | Already works | Fails the assignment (SQLite + ORM required) |
| D. SQLite for dev + Postgres for prod with one Prisma model | Shows DBMS-agnostic usage in production | Two schemas/migration sets; more work for a 1–2 day deadline |

**Chosen: A.** The UI, Pyodide checking, ranking rules and analysis already exist; only the data layer and auth
are replaced. D is filed as #50.

## Architecture

```
browser ── pages/components (app/) ── lib/client (api)
                                          ├─ http.ts   → fetch /api/*
                                          └─ mock/     → mockService (no backend; NEXT_PUBLIC_API_MODE=mock)
server  ── app/api/**/route.ts (thin: parse, auth, call a service, map errors)
            └─ lib/server/* services (auth, contest, rounds, ranking, admin)
                 └─ getStore(): Store ── MemoryStore   (DB_DRIVER=memory: tests, quick runs)
                                      └─ PrismaStore   (DB_DRIVER=sqlite, default: Prisma ORM → SQLite file)
contract ─ openapi.yml (every /api path; a test checks it matches the route files)
```

## Decisions

1. **One Next.js app** (App Router). Static landing and leaderboard stay in `public/index.html` and `public/board.html`
   (rewritten to `/` and `/board`) and read `/api/public/landing`, `/api/auth/me`, `/api/board`.
2. **Frontend only through `lib/client`.** `api.auth`, `api.contest`, `api.admin`, `api.public`. The implementation is
   chosen by `NEXT_PUBLIC_API_MODE` (`http` default, `mock` for `npm run dev:mock`). Mock data lives in the browser
   (sessionStorage) and reuses the shared validation/rules modules.
3. **Store interface** (`lib/server/store/types.ts`) is the only way to storage. Two implementations pass the same
   contract test suite (`tests/store/contract.test.ts`). Business rules (ranking, round windows, start/extend/close,
   variants) live in services, not in the store, so both stores behave the same.
4. **Database: SQLite through Prisma 6** (`prisma/schema.prisma`, migrations committed). JSON columns for task options,
   tests, forbidden list, AI refs and telemetry. `DATABASE_URL=file:./dev.db`. Postgres later = change the provider (#50).
5. **Auth: our own.** Passwords hashed with Node `crypto.scrypt` (N=16384, r=8, p=1, 16-byte salt, 64-byte key),
   compared with `timingSafeEqual`. Sessions are the existing HMAC-signed httpOnly cookies: `debug_session` (student,
   12 h) and `debug_admin` (admin, 12 h). One `users` table with `role` = `student` | `admin`.
6. **Admins** are created by `npm run db:seed` from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Every `/api/admin/*` handler
   calls `requireAdmin()`. A student session never grants admin access.
7. **Password reset:** random 32-byte token, only its SHA-256 is stored, 1-hour expiry, single use. `Mailer` interface;
   MVP uses a console mailer (and an outbox for tests).
8. **Images** for Trace tasks are stored in the database (`task_images`, ≤ 2 MB, `image/png|jpeg|gif|webp`) and served
   by `GET /api/images/{id}` with long cache headers. Existing `/t/*.png` files stay as static assets.
9. **Caches** stay as in the original (per instance): contest 3 s, rounds 2 s, tasks 10 s, extensions 5 s, ranking 8 s,
   student 60 s, landing 15 s. Admin writes clear the relevant cache keys.
10. **Rate limits** stay in memory per instance (`lib/rateLimit.ts`): login failures per email/IP, register/forgot per
    email/IP. Shared limits → #52.
11. **Tests:** `node:test` through `tsx` for unit and store-contract tests; e2e suites start the real Next.js server
    with `E2E_TEST_HOOKS=1` (enables `/api/__test/*`: reset, seed, patch, dump, outbox) on `DB_DRIVER=memory` and on a
    temporary SQLite file. The hooks return 404 unless the env flag is set.
12. **Iterations** (see `process.md`): 0 process → 1 frontend + mockService → 2 `openapi.yml` → 3 in-memory backend →
    4 SQLite → 5 connect. Each iteration is a set of `iter-*` issues.
13. **Times** are stored as UTC ISO strings; the UI shows Kazakhstan time (UTC+5) as before.
14. **Relative imports only**; no `@/` alias (inherited from the original project).

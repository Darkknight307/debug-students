# Release checklist

## Iteration 6 — test, containerise and deploy (2026-11-03)

- [x] `npm test` — 90 passed (unit, frontend mock client, openapi contract, store contract on MemoryStore + PrismaStore/Postgres, data import)
- [x] `npm run test:e2e` — contest 66, auth 53, admin 49 on `DB_DRIVER=memory` **and** on Postgres
- [x] `npm run test:pw:compose` — 118 passed, 8 skipped by design (Debug/Build functional cases desktop-only), 0 failed; Docker image + Postgres, desktop + 375 px
- [x] `npm run build` succeeds; `docker compose up --build` healthy with `SEED_ON_START=1` (#85)
- [x] CI green on `main` (unit, api-e2e, build, docker-e2e, infra-lint); deploy job waits for the AWS variables
- [x] Production data copied Turso → Neon with `npm run db:import`: users 2, contests 2, rounds 6, tasks 32, submissions 2, variants 1, activity 3 — counts equal (#67)
- [x] Vercel production on Neon: deployment Ready, `/api/health` db up, imported data on the landing (#67; owner still removes `TURSO_*` and confirms logins)
- [x] AWS stack created (owner ran `infra/aws/bootstrap.sh`), CI deploy verified (`/api/health` = commit SHA), data imported over SSM, HTTPS on `https://18-158-27-155.sslip.io`, ports 22/3000/5432 closed (#68, #57)
- [x] No SQLite/libSQL code or dependency left; no secrets in the repo (`.env*` ignored)
- [x] Every `e2e-test` and `user-test-bug` issue closed by the QA engineer

## MVP (2026-10-20)

- [x] `npm test` — 70 passed (unit, store contract on MemoryStore + PrismaStore/SQLite, openapi contract)
- [x] `npm run test:e2e` — contest 66, auth 53, admin 49 on `DB_DRIVER=memory` **and** on SQLite
- [x] `npx tsc --noEmit` and `npm run build` succeed
- [x] Manual session on the SQLite dev server: landing (live contest + participant list), registration → `/me`,
      admin login, seeded contest with 16 tasks, leaderboard idle state; mock mode run through student + admin
- [x] No Supabase code, SQL or dependency left; no secrets in the repo (`.env` ignored)
- [x] Every `mvp` and `user-test-bug` issue closed by the QA engineer

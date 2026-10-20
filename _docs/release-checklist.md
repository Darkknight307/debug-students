# Release checklist

- [x] `npm test` — 70 passed (unit, store contract on MemoryStore + PrismaStore/SQLite, openapi contract)
- [x] `npm run test:e2e` — contest 66, auth 53, admin 49 on `DB_DRIVER=memory` **and** on SQLite
- [x] `npx tsc --noEmit` and `npm run build` succeed
- [x] Manual session on the SQLite dev server: landing (live contest + participant list), registration → `/me`,
      admin login, seeded contest with 16 tasks, leaderboard idle state; mock mode run through student + admin
- [x] No Supabase code, SQL or dependency left; no secrets in the repo (`.env` ignored)
- [x] Every `mvp` and `user-test-bug` issue closed by the QA engineer

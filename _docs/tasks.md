# Tasks (initial backlog)

Decomposed from `plan.md` and the iteration plan in `decisions.md`. Each task fits one agent session.

> Every task below was moved to a GitHub issue with the same number. **GitHub issues are the only active
> backlog — this file is the historical snapshot.** Labels: `mvp`, `post-mvp`, `user-test-bug`, `iter-*`.

## iter-0-process

### 1. Baseline: import the DEBUG app and make it run
Goal: The existing DEBUG contest prototype is in the repo and starts locally.
Description: Import the school-edition DEBUG app (Next.js, Trace/Debug/Build, Pyodide, leaderboard, admin panel) as the starting point. Rename the package, remove the JUZ40 brand, keep design and mechanics.

### 2. Agent context: AGENTS.md and CLAUDE.md
Goal: A coding agent can start a session from AGENTS.md alone: stack, commands, rules, where the docs are.
Description: AGENTS.md with commands (dev, mock dev, tests, build), rules (one issue at a time, issue number in commits, no new deps without asking), document map. CLAUDE.md points to AGENTS.md.

### 3. Team roles and process: pm.md, software-engineer.md, qa.md, qa-engineer.md
Goal: Every issue goes through the same lifecycle with clear roles.
Description: _docs/process.md (orchestrator lifecycle, labels mvp/post-mvp/user-test-bug, bug flow), _docs/task-template.md, _docs/team/pm.md, software-engineer.md, qa.md (adds test cases), qa-engineer.md (verifies and closes).

### 4. Brainstorm chat history, plan.md and decisions.md
Goal: The reasoning behind the student edition is written down and committed.
Description: chat-brainstorm.md (the brainstorm chat before building), _docs/plan.md (spec), _docs/decisions.md (stack options and choices: Next.js, Prisma, SQLite, iteration plan).

### 5. Design references for the coding agent
Goal: The coding agent has concrete design references instead of a generic UI.
Description: _docs/design.md: the design is taken as done — link to the design spec (docs/debug-2026-design.md), the original site, the new DEBUG logo, screenshots of every screen, tokens and animation rules.

### 6. Test tooling: npm test, testing guidelines
Goal: One command runs all unit tests; the guidelines say how to write tests.
Description: Add tsx as a dev dependency, `npm test` (node:test via tsx), `npm run test:e2e`, _docs/testing-guidelines.md.

## iter-1-frontend-mock

### 7. Shared API types for the frontend
Goal: The frontend and the backend agree on one set of TypeScript DTOs.
Description: lib/client/types.ts: Student, Contest, Round, Task (public/admin), ContestState, Board, Landing, admin DTOs, ApiError.

### 8. API client with http implementation and a mode switch
Goal: Pages call one `api` object; NEXT_PUBLIC_API_MODE chooses http or mock.
Description: lib/client/http.ts (fetch, JSON errors → ApiError), lib/client/index.ts (mode switch). No page talks to fetch/Supabase directly afterwards.

### 9. mockService: student auth
Goal: Register, login, logout, me, forgot and reset work in the browser without a backend.
Description: lib/client/mock/*: in-memory users, same validation messages as the server (lib/registration.ts), session kept in sessionStorage.

### 10. mockService: contest flow
Goal: A demo contest with Trace, Debug and Build rounds can be played end to end on mocks.
Description: Mock contest state, answers, challenge/submit with hidden tests, activity, ranking, board.

### 11. mockService: admin
Goal: The admin panel works on mocks: contests, rounds, tasks, operator, stats, analysis.
Description: Mock admin login, contests CRUD, round start/extend/close, task CRUD with images (data URLs), student search, extensions, analysis data.

### 12. Auth pages use the API client
Goal: Login/register/forgot/reset pages work through `api.auth.*` in both modes.
Description: AuthPanel, ResetForm, LogoutButton, /me use the client; no direct fetch.

### 13. Contest page uses the API client
Goal: The contest page (Trace/Debug/Build) works through `api.contest.*` in both modes.
Description: ContestClient, TraceRound, CodeRound, telemetry sender use the client.

### 14. Admin login on the API client (own admin session)
Goal: The admin panel is protected by the site's own admin login, not Supabase Auth.
Description: AdminGate uses api.admin.me/login/logout; logout clears the session.

### 15. Admin home: contests list, create, student stats
Goal: The admin home lists contests, creates a contest with 3 rounds and shows registration stats.
Description: app/admin/page.tsx on api.admin.*: list, create, stats (total, universities, top list).

### 16. Admin contest page: status, title/date, tasks list, delete
Goal: An admin can publish/finish a contest, edit title and start time, see and delete tasks.
Description: app/admin/c/[id]/page.tsx on api.admin.*.

### 17. Task editor on the API client (with image upload)
Goal: Trace/Debug/Build tasks can be created and edited, Trace images uploaded.
Description: TaskEditor on api.admin.createTask/updateTask/uploadImage.

### 18. Operator console on the API client
Goal: The operator starts, extends and closes rounds, locks the board and gives +5 min to one student.
Description: OperatorConsole on api.admin.*.

### 19. AI analysis page and recheck panel on the API client
Goal: The AI/copy analysis page and the recheck panel load their data through the client.
Description: app/admin/c/[id]/ai/page.tsx and RecheckPanel on api.admin.analysis/ranking.

### 20. npm run dev:mock — the whole UI works without a backend
Goal: A designer or tester can click through every screen with no database.
Description: Script `dev:mock` (NEXT_PUBLIC_API_MODE=mock), demo accounts listed in README, smoke checked in the browser.

## iter-2-contract

### 21. openapi.yml: public and student auth endpoints
Goal: The public and auth API is described in OpenAPI 3.1.
Description: /api/public/landing, /api/board, /api/cron/keepalive, /api/auth/register|login|logout|me|forgot|reset; schemas match lib/client/types.ts.

### 22. openapi.yml: contest endpoints
Goal: The contest API is described in OpenAPI 3.1.
Description: /api/contest/state|answer|challenge|submit|activity with request/response schemas and error codes.

### 23. openapi.yml: admin endpoints
Goal: The admin API is described in OpenAPI 3.1.
Description: /api/admin/auth/*, contests, rounds, tasks, images, students, extensions, stats, ranking, analysis.

### 24. Contract test: openapi.yml paths match the route handlers
Goal: The contract cannot silently drift from the code.
Description: A unit test parses openapi.yml and checks every path+method has a route handler and every route handler is in the contract.

## iter-3-backend-memory

### 25. Store interface and MemoryStore: users and reset tokens
Goal: The backend talks to storage only through a Store interface; an in-memory implementation exists.
Description: lib/server/store/types.ts, lib/server/store/memory.ts, getStore() selected by DB_DRIVER.

### 26. MemoryStore: contests, rounds, tasks, images
Goal: Contests, rounds, tasks and task images are stored in memory.
Description: CRUD + current contest lookup (running first, else nearest published).

### 27. MemoryStore: submissions, variants, extensions, activity
Goal: Contest activity data is stored in memory.
Description: Submissions (append-only), A/B variants (first write wins), per-student extensions, telemetry upsert.

### 28. Ranking and round operations as services
Goal: Ranking and start/extend/close behave exactly like the old SQL functions.
Description: lib/server/ranking.ts (last submission per task, score desc, earlier last-correct wins, running Trace hidden), lib/server/rounds.ts.

### 29. Password hashing and student auth API on the store
Goal: Students register and log in with email + password stored as a scrypt hash.
Description: lib/server/password.ts, /api/auth/register|login|logout|me on the store; rate limits kept.

### 30. Forgot/reset password with one-time tokens and a console mailer
Goal: A student can set a new password through a one-time link.
Description: Reset tokens stored hashed with expiry, Mailer interface, console mailer, same response for unknown emails.

### 31. Admin auth API and guard
Goal: Only users with role=admin can use /api/admin/*.
Description: /api/admin/auth/login|logout|me, separate signed cookie, requireAdmin() helper.

### 32. Contest API on the store
Goal: state/answer/challenge/submit/activity work on the store with unchanged behaviour.
Description: lib/contest/server.ts rewritten on the store; caches kept.

### 33. Public API on the store: landing, board, keepalive
Goal: The landing page, the leaderboard and keepalive read from the store.
Description: Only «Тегі Аты» leaves the server; board idle state when there is no contest.

### 34. Admin API: contests, rounds, operator actions
Goal: Contests and rounds are managed over HTTP.
Description: GET/POST /api/admin/contests, GET/PATCH /api/admin/contests/{id}, POST /api/admin/rounds/{id}/start|extend|close, operator summary.

### 35. Admin API: tasks CRUD and images
Goal: Tasks are created, updated and deleted over HTTP; images are uploaded and served.
Description: POST /api/admin/tasks, PATCH/DELETE /api/admin/tasks/{id}, POST /api/admin/images, GET /api/images/{id}.

### 36. Admin API: stats, student search, extensions, analysis, ranking
Goal: The remaining admin screens have their endpoints.
Description: GET /api/admin/stats, GET /api/admin/students?q=, POST /api/admin/rounds/{id}/extensions, GET /api/admin/contests/{id}/ranking|analysis.

### 37. Test hooks and e2e suites on the in-memory backend
Goal: The e2e suites run against the real Next.js server with the in-memory store.
Description: E2E_TEST_HOOKS=1 enables /api/__test/* (seed, patch, dump, outbox); contest, auth and admin e2e rewritten on it.

## iter-4-backend-sqlite

### 38. Prisma schema and first migration (SQLite)
Goal: The data model is defined once in Prisma and migrated into a SQLite file.
Description: prisma/schema.prisma, prisma/migrations/*, DATABASE_URL=file:./dev.db.

### 39. PrismaStore implementation
Goal: Every Store method works on SQLite through Prisma.
Description: lib/server/store/prisma.ts; transactions for round start and contest creation; DB_DRIVER=sqlite is the default.

### 40. Store contract tests on MemoryStore and PrismaStore
Goal: Both stores pass the same test suite.
Description: tests/store/contract.test.ts runs every case against memory and a temporary SQLite file.

### 41. Seed: admin account and the first contest
Goal: A fresh database has an admin and the first contest with the October tasks.
Description: prisma/seed.ts (ADMIN_EMAIL/ADMIN_PASSWORD), prisma/seed-data/october-tasks.json, `npm run db:seed`.

### 42. Remove Supabase completely
Goal: No Supabase code, dependency, SQL or env variable is left.
Description: Delete lib/supabase*.ts, supabase/*.sql, @supabase/supabase-js, tests/db; update .env.example.

## iter-5-integration

### 43. Frontend uses the real backend by default
Goal: `npm run dev` serves the UI against the SQLite backend; static landing and board read live data.
Description: Default API mode http; dev script runs migrations; landing/board checked against SQLite.

### 44. Full e2e on SQLite: student and admin flows
Goal: The e2e suites also pass against a temporary SQLite database.
Description: `npm run test:e2e` runs contest, auth and admin suites on memory and on SQLite.

### 45. Manual user test session (desktop and mobile)
Goal: A person-like run through every screen finds the bugs tests miss; each bug becomes a user-test-bug issue.
Description: Register → contest (Trace, Debug, Build) → board → admin (create contest, tasks, operator, analysis) on desktop and 375px.

### 46. README and docs refresh
Goal: The repo explains how to run, test and extend the app.
Description: README (run, mock mode, tests, architecture), _docs/api.md generated from openapi.yml, decisions/process updated with what we learned.

### 47. Final regression and release checklist
Goal: Every test passes, every mvp and user-test-bug issue is closed.
Description: Run all suites, build, manual smoke; checklist in _docs/release-checklist.md.

## post-mvp

### 48. Email delivery through SMTP (Brevo or Resend)
Goal: Reset links reach real inboxes.
Description: Implement an SMTP Mailer behind the Mailer interface; Kazakh templates.

### 49. Email confirmation on sign-up
Goal: Only confirmed emails appear in the participant list.
Description: Confirm token, unconfirmed state on login, resend button.

### 50. Production database: Postgres through the same Prisma schema
Goal: The same app runs on Postgres in production.
Description: Switch the datasource provider, migrations for Postgres, CI job on Postgres.

### 51. Deploy with persistent storage
Goal: The site is online with data that survives restarts.
Description: Render/Fly with a volume for SQLite, or Turso/libSQL.

### 52. Shared rate limiting for several instances
Goal: Rate limits hold when the app runs on more than one instance.
Description: Move counters to Redis/Upstash or the database.

### 53. Admin accounts management UI
Goal: Admins can add and remove other admins in the panel.
Description: List, invite, remove; audit log.

### 54. Export contest results to CSV
Goal: Organisers download the final table.
Description: CSV with rank, name, university, course, score per round.

### 55. Russian UI language
Goal: Students can switch the UI to Russian.
Description: i18n dictionary, language switch, persisted choice.

### 56. Browser e2e with Playwright
Goal: Real browser flows run automatically.
Description: Register, play Trace/Debug/Build, admin operator flow.

### 57. GitHub Actions CI
Goal: Every push runs the tests.
Description: Workflow: npm ci, prisma generate, npm test, e2e on memory and SQLite, build.

### 58. Student profile editing
Goal: A student can fix a typo in their name or university.
Description: Edit form on /me with the same validation; admin sees the change.

### 59. Accessibility audit (WCAG AA)
Goal: Keyboard and screen-reader users can take part.
Description: Audit contrast, focus order, labels, live regions; fix findings.

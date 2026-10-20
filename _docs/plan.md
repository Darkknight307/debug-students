# DEBUG · Студенттер — plan

Spec produced by the chat brainstorm (`chat-brainstorm.md`).

## Problem

DEBUG ran as a coding contest for one school's students, with logins borrowed from that school's platform.
Students from any university or college want to take part, but they have no such account, and the site depends on
an external auth service and a hosted database.

## Idea

The same contest for **students**: they register on the site itself, take part in three timed rounds
(Trace → Debug → Build) with Python running in the browser, and see a live leaderboard. Organisers run the contest
from an operator/admin panel. Data lives in our own database (SQLite through an ORM).

## Users

- **Student** — registers with email + password, takes part, sees their own place.
- **Admin / operator** — creates contests and tasks, starts/extends/closes rounds, gives a student +5 minutes,
  locks the leaderboard, reviews the AI/copy analysis. Admin accounts are created by seed/CLI, not by sign-up.
- **Visitor** — sees the landing page (countdown, participant list «Тегі Аты») and the leaderboard.

## Decisions

1. **Registration on the site:** last name, first name, university/college, course (1–6, master's, PhD), email,
   password (≥ 8 characters) are required; phone is optional. Publicly only «Тегі Аты» is shown; email, phone and
   university are visible to admins only.
2. **No email confirmation in the MVP.** A student is in the participant list right after registering.
   Email confirmation → #49; real email delivery → #48.
3. **Forgot password:** one-time reset link (token stored hashed, expires in 1 hour). In the MVP the link is
   delivered by a console mailer (server log); SMTP later (#48). Unknown emails get the same answer.
4. **Anyone can register; registration is always open**, also during the contest.
5. **Brand stays DEBUG.** Everything from the school's platform is removed: logo (new block-grid `DEBUG_` logo),
   font (IBM Plex Sans, self-hosted with Kazakh letters), merch prize, host name, Google Meet. Format: online, on this site.
6. **Prizes:** all three places «Жарыс алдында жарияланады».
7. **Contest:** three rounds — Trace (multiple choice, A/B variants possible), Debug (fix one line), Build (write a
   function). The operator starts each round; personal +5 minutes; 5 s grace for network delay.
8. **Hybrid checking:** «Тексеру» runs public examples in the browser; «Жіберу» gets up to 25 hidden test inputs with
   a signed token, the browser runs them in Pyodide, the server compares outputs. Answer keys never leave the server.
9. **Ranking:** last submission per task counts; score descending, ties broken by the earlier last correct answer;
   a running Trace round is hidden from the ranking; the leaderboard auto-locks in the last 10 minutes.
10. **Anti-cheat:** copy/paste blocked in Debug/Build, any single input over 40 characters rejected; telemetry
    (tab switches, paste attempts, typing counts) is stored and the student is told it is on.
11. **AI/copy analysis never gives a verdict** — only a suspicion level with reasons; a person decides.
12. **First contest:** «DEBUG · Студенттер» with the October contest tasks as a template (10 Trace, 4 Debug, 2 Build);
    title/date are edited in the admin panel.
13. **Storage:** SQLite through Prisma ORM (DBMS-agnostic). No external auth service.
14. **Design is done** — the existing DEBUG design is the reference (`_docs/design.md`).
15. **Repo:** public `Darkknight307/debug-students`; work tracked in GitHub issues (`mvp`, `post-mvp`, `user-test-bug`).

## Main flows

1. Visitor opens `/` → sees countdown, participant list, rules → «Тіркелу».
2. Student registers on `/login?tab=register` → lands on `/me` («тіркелдіңіз») → «Жарыс бетіне өту».
3. Student logs in on `/login`; forgot password → reset link → `/auth/reset` → new password → logged in.
4. Contest day: `/contest` shows the countdown; the operator starts Trace → students answer → Debug → Build;
   «Тексеру» / «Жіберу»; `/board` shows the top 10 live.
5. Admin logs in on `/admin` → creates a contest (3 rounds created automatically) → adds tasks (Trace image upload)
   → publishes → operates rounds → reviews analysis and rechecks the top.

## Not in v1

Email delivery and confirmation, Postgres in production and deployment, admin management UI, CSV export,
Russian UI, profile editing, Playwright/CI, accessibility audit — all filed as `post-mvp` issues (#48–#59).

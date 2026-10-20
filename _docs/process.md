# Process

How work is organised in this repo (AI-native workflow: brainstorm → plan → issues → roles).

## Backlog

- **GitHub issues are the only backlog.** `_docs/tasks.md` is the historical snapshot they were created from.
- Labels:
  - `mvp` — in the MVP scope. Must be closed before the deadline.
  - `post-mvp` — follow-ups after the MVP. Never dropped silently: anything cut from an `mvp` issue lands here.
  - `user-test-bug` — a bug found while **actually running and testing** the app (not by reading code). Must be closed before the deadline.
  - `iter-0-process` … `iter-5-integration` — which iteration an `mvp` issue belongs to.
- Work on **one issue at a time**, in issue-number order unless a dependency says otherwise.
- Every commit message references the issue: `Add PrismaStore (#39)`.

## Iterations

| # | Iteration | Result |
|---|---|---|
| 0 | Process, docs, tooling | AGENTS.md, roles, plan, decisions, design references, `npm test` |
| 1 | Frontend with **mockService** | Every page talks to one `api` client; `npm run dev:mock` runs the whole UI with no backend |
| 2 | **Contract** | `openapi.yml` describes every endpoint; a test keeps it in sync with the route handlers |
| 3 | Backend, **in-memory store** | Route handlers → services → `Store` interface → `MemoryStore` |
| 4 | Backend, **SQLite** | `PrismaStore` (Prisma ORM, SQLite file) passes the same store contract tests |
| 5 | **Connect** frontend + backend | Real backend by default, e2e on SQLite, manual user test session, docs |

## Roles

| Role | File | Does | Never |
|---|---|---|---|
| Orchestrator | this file | picks the next issue, dispatches roles | grooms, implements, verifies |
| Product Manager | `team/pm.md` | grooms an issue into `task-template.md`; grooms bug reports | writes code |
| QA (test designer) | `team/qa.md` | adds test cases to an issue before implementation | writes code, closes issues |
| Software Engineer | `team/software-engineer.md` | implements one groomed issue | changes acceptance criteria, closes issues |
| QA Engineer | `team/qa-engineer.md` | verifies every criterion against running code, **closes** the issue | fixes code |

Each role works with only its role file, `AGENTS.md` and the issue as context.

## Lifecycle of an `mvp` issue

1. **Pick** the lowest-numbered open `mvp` issue whose dependencies are closed.
2. **Groom** — the PM rewrites the body with `task-template.md` and leaves a grooming comment.
3. **Test cases** — for issues the PM marks *needs test design*, QA (`qa.md`) adds a test-case comment.
4. **Implement** — the engineer implements, commits with `(#n)`, and leaves an implementation comment (commits, files, test results, anything flagged).
5. **Verify** — the QA engineer checks every criterion against the running app and posts `QA: PASS` or `QA: FAIL` with a verdict per criterion.
6. On **FAIL** → back to step 4. On **PASS** → the QA engineer ticks the checkboxes and **closes** the issue.

## Bug flow (`user-test-bug`)

When running the app (browser, curl, e2e) shows wrong behaviour:

1. File an issue labelled `user-test-bug` with **Goal** (what should happen) and **Description** (steps, expected, actual, environment, screenshot/log if useful).
2. The **PM** grooms it (`pm.md`): acceptance criteria, severity, scope.
3. **QA** (`qa.md`) adds more test cases: the regression test that must fail before the fix, plus neighbouring cases.
4. The **engineer** fixes it with a regression test, commit `Fix … (#n)`.
5. The **QA engineer** re-runs the steps and the tests and closes it.

## Stop condition

`gh issue list --label mvp --state open` **and** `gh issue list --label user-test-bug --state open` are both empty,
all test suites pass and `next build` succeeds.

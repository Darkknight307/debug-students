# Task template

The PM grooms every issue into exactly these sections.

```markdown
**Goal:** <one or two sentences: what is true when this issue is done>

**Acceptance criteria**

<group criteria under short bold headings when there are many>

- [ ] <checkable statement — something QA can verify against running code>
- [ ] <the awkward edge cases: empty input, wrong user, duplicates, not found, closed round, …>
- [ ] Tests cover <the risky cases>; `npm test` / `npm run test:e2e` pass.

**Out of scope**

- <thing that is NOT done here> → #<follow-up issue>

**Constraints**

- <files/modules to stay within>
- <libraries to use or avoid; "no new dependencies" unless stated>
- <decisions/guidelines to follow, e.g. `_docs/decisions.md` item 3>

---
Refs: `_docs/tasks.md` task <n>
```

## Bug reports (`user-test-bug`)

A bug starts with two sections, then the PM grooms it into the template above:

```markdown
**Goal:** <what should happen>

**Description:** <steps to reproduce, expected, actual, where (URL, viewport, command)>
```

## Rules

- Every criterion is checkable — no "works well", "looks nice".
- Each criterion names the observable behaviour (status code, field, text on screen, test name).
- Out-of-scope items link to an issue; if none exists, the PM creates it (label `post-mvp`).
- An engineer must be able to implement the issue from the issue alone.

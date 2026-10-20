# DEBUG · Студенттер

Онлайн кодинг жарысы студенттерге: үш кезең — **Trace** (кодты оқу), **Debug** (қатені түзет), **Build** (өзің жаз).
Python браузерде (Pyodide) орындалады, нәтиже тікелей эфир лидербордында көрінеді.

> Бұл — бастапқы нұсқа (DEBUG мектеп жарысынан алынған прототип, Supabase-ке негізделген).
> Әрі қарайғы жұмыс GitHub issues арқылы итерациялармен жүреді.

## UI on mocks (no backend)

```bash
npm install
npm run dev:mock   # http://localhost:3000 — the MOCK badge shows the mode
```

Demo accounts (stored only in the browser's localStorage):

| Role | Email | Password |
|---|---|---|
| Student | `demo@mock.test` | `demo-pass-1` |
| Admin (`/admin`) | `admin@mock.test` | `admin-pass-1` |

Works on mocks: registration, login, forgot/reset (the link is printed in the browser console), `/me`, the contest
page (Trace/Debug/Build with Pyodide), the whole admin panel. The static landing page and leaderboard need the
real backend.

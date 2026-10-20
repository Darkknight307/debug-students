# Chat brainstorm — DEBUG · Студенттер

This is the chat history of the brainstorm that produced `_docs/plan.md` and `_docs/decisions.md`.
It follows the AI-native flow: start from the idea, let the assistant read what exists, ask **a few questions at a
time with short options (recommended option first)**, and only then build.

- Date: 2026-10-20
- Participants: **Student** (Darkknight307) and **Assistant** (Claude, coding agent)
- Language: the chat happened in Kazakh; an English translation follows every message.
- Starting point: the DEBUG contest site that already ran for JUZ40 school students (`debug-2026`), and a handoff kit
  with its source code. Two things were decided in an earlier chat and were not asked again:
  students sign up **on the site itself with email + password**, and the brand **stays DEBUG**.

---

## Round 1 — the student edition

**Student:** DEBUG-students-kit.zip архивін осы папкаға аш, START_HERE.md файлын толық оқы да, сондағы нұсқаулық бойынша сайтты жаса. Тапсырма 100% түсінікті болғанға дейін сұрақ қой. JUZ40 логотипін толығымен DEBUG деген өзіңнің қалауың бойынша белгілі бір логотип жаса да, сонымен алмастыр.
> *Unpack the kit here, read START_HERE.md fully and build the site by it. Ask questions until the task is 100% clear. Replace the JUZ40 logo completely with a DEBUG logo of your own design.*

**Assistant:** Архивті аштым, START_HERE.md-ні толық оқыдым. Supabase құжатын тексердім: кірістірілген пошта сағатына 2 хат қана жібереді және тек жоба командасына барады. Сұрақтарым:
1. **Тіркелу өрістері?** — (а) Тегі, Аты, оқу орны, курс, email, құпия сөз міндетті, телефон — қалауынша *(ұсынылады)*; (ә) бәрі міндетті; (б) тек Тегі, Аты, email, құпия сөз.
2. **Растау хаты қалай жетеді?** — (а) әзір растаусыз, SMTP кейін *(ұсынылады)*; (ә) Brevo SMTP; (б) Resend + өз домен; (в) растау мүлде жоқ.
3. **Кім тіркеле алады?** — (а) кез келген адам, үнемі ашық *(ұсынылады)*; (ә) жарыс басталғанда жабылады; (б) тек белгілі email домендері.
4. **JUZ40-тың басқа іздері** (шрифт, «JUZ40 мерчі», «Жүргізуші — Эду ағай»)? — (а) толық алынады *(ұсынылады)*; (ә) тек логотип ауысады.
> *I unpacked the kit and read START_HERE.md. Supabase's built-in mail sends only 2 emails per hour and only to the project team. Questions: (1) registration fields — last name, first name, university, course, email, password required, phone optional (recommended) / all required / minimal; (2) how confirmation emails reach students — no confirmation for now, SMTP later (recommended) / Brevo / Resend / never; (3) who can register — anyone, always open (recommended) / closes when the contest starts / only some email domains; (4) other JUZ40 traces — remove completely (recommended) / only swap the logo.*

**Student:** Ұсыныс, телефон — қалауынша. · Әзір растаусыз, SMTP кейін. · Кез келген адам, үнемі ашық. · JUZ40 толық алынады.
> *Recommended fields with optional phone. · No confirmation for now, SMTP later. · Anyone, always open. · Remove JUZ40 completely.*

## Round 2 — contest details

**Assistant:** Тағы төрт сұрақ:
1. **«JUZ40 мерчі» (1-орын) орнына?** — (а) 1-орын «жарияланады», 7 000 / 5 000 қалады *(ұсынылады)*; (ә) 10 000 / 7 000 / 5 000; (б) барлық жүлде «жарияланады».
2. **«Жүргізуші — Эду ағай» және «Google Meet»?** — (а) Эду ағай алынады, Meet қалады *(ұсынылады)*; (ә) екеуі де қалады; (б) екеуі де алынады.
3. **Сайттың мекенжайы?** — (а) `debug-students` *(ұсынылады)*; (ә) `debug-2026-students`; (б) `debug-kz`.
4. **Тапсырмалар?** — (а) Қазан жарысының тапсырмалары үлгі ретінде *(ұсынылады)*; (ә) бос жарыс, өзім енгіземін; (б) студенттерге жаңа тапсырмалар.
> *Four more: (1) what replaces the merch prize — first place "to be announced" (recommended) / 10 000 tenge / all prizes "to be announced"; (2) the host line and Google Meet — drop the host, keep Meet (recommended) / keep both / drop both; (3) address — debug-students (recommended) / …; (4) tasks — October contest tasks as a template (recommended) / empty contest / new harder tasks.*

**Student:** Барлық жүлде «жарияланады». · Екеуі де алынады. · debug-students. · Қазан тапсырмалары үлгі ретінде.
> *All prizes "to be announced". · Drop both. · debug-students. · October tasks as a template.*

**Assistant:** Тағы бір маңызды нәрсе таптым: Supabase Auth тіркелу мен кіруді IP бойынша шектейді, ал шақырулардың бәрі серверден шығады — жарыс алдында көп студент бір мезетте кірсе, шекке тіреліп қалуы мүмкін. Студенттің шын IP-ін жіберу мүмкіндігін қосамын. Логотипті блоктық тор бойынша `DEBUG_` деп жасаймын — әріптер 6 бірлік торға салынады, «Бренд» анимациясында торкөздер әріптерге дәл түседі.
> *One more finding: Supabase Auth rate-limits sign-up and sign-in per IP, and all our calls come from the server — a crowd logging in before the contest could hit the limit. I'll forward the student's real IP. The logo will be a block-grid `DEBUG_`: letters on a 6-unit grid, so the block animation lands exactly on the strokes.*

## Round 3 — the coursework requirements

**Student:** *(pasted the assignment)* GitHub Issues as in ai-native-development-specifications · non-generic design agents or good references · close all `mvp` issues (up to 100 issues) · persistent storage SQLite · DBMS-agnostic ORM · iterations: frontend with mockService → openapi.yml → backend in memory → backend SQLite → connect · all `.md` files in the repo · brainstorm chat history as `.md` · actually run and test the app · bugs as `user-test-bug` issues groomed by `pm.md`, test cases by `qa.md` · `qa-engineer.md` closes `mvp` and `user-test-bug` issues.
Осы тапсырмаға сай кішкене түзетіп жібер және github-қа салып, сілтемесін жіберші.
> *Adjust the project to this assignment, put it on GitHub and send me the link.*

**Assistant:** Бұрынғы `deadline-squad` репоңыздағы құрылымды үлгі ретінде аламын. Бірақ SQLite + ORM талабы Supabase-ті толық ауыстыруды білдіреді. Сұрақтар:
1. **SQLite?** — (а) толық SQLite + Prisma: өз auth, әкімші де сайттың өзінде, суреттер дерекқорда *(ұсынылады)*; (ә) SQLite (dev) + Postgres (prod) бір Prisma-мен.
2. **Репо?** — (а) жаңа public `debug-students` *(ұсынылады)*; (ә) private.
3. **Дедлайн?** — (а) 1–2 күн; (ә) апта соңы; (б) нақты күн.
4. **Дизайн?** — (а) референстер: спецификация, скриншоттар, логотип *(ұсынылады)*; (ә) v0 / Lovable макеті; (б) Claude Design артефакті.
> *I'll follow the structure of your earlier deadline-squad repo. But SQLite + ORM means replacing Supabase entirely. (1) full SQLite + Prisma with our own auth and admin, images in the DB (recommended) / SQLite for dev + Postgres for prod; (2) new public repo (recommended) / private; (3) deadline; (4) design — references (recommended) / a v0 or Lovable mock-up / a Claude Design artifact.*

**Student:** Қайсысы жасауға тезірек болады, соны жасай бер. · Жаңа public `debug-students`. · 1–2 күн ішінде. · Осы дизайнды уже дайын деп ала бер.
> *Do whichever is faster to build. · New public debug-students. · Within 1–2 days. · Take the current design as done.*

**Assistant:** Онда: бір Prisma схемасы + SQLite (екі схемадан тезірек; Postgres-ке ауысу — провайдердегі бір жол), өз email + құпия сөз жүйесі (scrypt), әкімші кіруі сайттың өзінде. 47 `mvp` + 12 `post-mvp` issue, итерациялар `iter-0` … `iter-5` тегтерімен. Енді осының бәрін `_docs/plan.md` пен `_docs/decisions.md`-ге спецификация ретінде сақтаймын.
> *Then: one Prisma schema on SQLite (faster than two; switching to Postgres is one line in the datasource), our own email + password auth (scrypt), admin login on the site itself. 47 `mvp` + 12 `post-mvp` issues with iteration labels `iter-0` … `iter-5`. Now I'll save all of this as the spec in `_docs/plan.md` and `_docs/decisions.md`.*

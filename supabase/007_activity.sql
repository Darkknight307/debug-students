-- ============================================================
-- DEBUG · бақылау дерегі және ЖИ үлгі жауаптары
-- Supabase → SQL Editor → New query → осыны толық қойып, Run. Қайта орындау қауіпсіз.
--
-- 1) activity — жарыс кезінде оқушының браузері жинайтын бақылау дерегі:
--    беттен неше рет шықты, қанша уақыт сыртта болды, қоюға (paste) неше рет тырысты,
--    кодты қандай қарқынмен терді. Бір оқушыға бір кезеңге бір жол.
--    Тек сервер жазады (service role); оқи алатын — тек әкімші.
-- 2) tasks.ai_refs — әкімші тапсырмаға қосатын ЖИ үлгі жауаптары (салыстыру үшін).
--    Оқушыға ешқашан жіберілмейді.
-- ============================================================

create table if not exists activity (
  round_id   uuid not null references rounds(id)   on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  contest_id uuid not null references contests(id) on delete cascade,
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (round_id, student_id)
);
create index if not exists activity_contest_idx on activity (contest_id);

alter table activity enable row level security;
drop policy if exists activity_admin on activity;
create policy activity_admin on activity for select using (is_admin());

alter table tasks add column if not exists ai_refs jsonb not null default '[]';  -- ["код 1", "код 2"]

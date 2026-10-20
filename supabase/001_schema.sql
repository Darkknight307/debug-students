-- ============================================================
-- DEBUG · жарыс жүйесі — негізгі схема
-- Supabase → SQL Editor → New query → осыны толық қойып, Run
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Әкімшілер ----------
-- Supabase Auth-та аккаунт құрылған соң, сол қолданушының id-ін осында қосамыз.
create table if not exists admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

-- ---------- Жарыстар (ай сайын) ----------
create table if not exists contests (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,              -- '2026-09'
  title        text not null,                     -- 'DEBUG · Қыркүйек 2026'
  starts_at    timestamptz not null,
  status       text not null default 'draft'
               check (status in ('draft','published','running','finished')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- Кезеңдер (3: mcq → debug → code) ----------
create table if not exists rounds (
  id           uuid primary key default gen_random_uuid(),
  contest_id   uuid not null references contests(id) on delete cascade,
  idx          int  not null check (idx between 1 and 9),
  kind         text not null check (kind in ('mcq','debug','code')),
  title        text not null,
  duration_min int  not null default 30,
  created_at   timestamptz not null default now(),
  unique (contest_id, idx)
);

-- ---------- Тапсырмалар ----------
-- Бір кестеде үш түрі де сақталады; kind-ке қатысы жоқ өрістер null болады.
create table if not exists tasks (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references rounds(id) on delete cascade,
  idx           int  not null,
  title         text not null,
  statement     text not null default '',   -- markdown
  points        int  not null default 1 check (points >= 0),

  -- mcq
  options       jsonb,                      -- [{"key":"a","text":"..."}]
  correct       text,                       -- 'a'

  -- debug / code
  starter_code  text,                       -- debug: бұзылған код · code: шаблон
  solution_code text,                       -- эталон шешім (тек әкімшіге)
  tests         jsonb,                      -- [{"in":"...","out":"..."}]

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (round_id, idx)
);

create index if not exists tasks_round_idx on tasks (round_id, idx);
create index if not exists rounds_contest_idx on rounds (contest_id, idx);

-- ---------- updated_at ----------
create or replace function touch_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists contests_touch on contests;
create trigger contests_touch before update on contests
  for each row execute function touch_updated_at();

drop trigger if exists tasks_touch on tasks;
create trigger tasks_touch before update on tasks
  for each row execute function touch_updated_at();

-- ---------- RLS ----------
-- Маңызды: anon кілтіне бұл кестелер МҮЛДЕ жабық. Оқушы тапсырманы тек
-- Next.js сервері арқылы, жауап кілттері алынып тасталған күйде алады.
alter table admins   enable row level security;
alter table contests enable row level security;
alter table rounds   enable row level security;
alter table tasks    enable row level security;

drop policy if exists admins_self on admins;
create policy admins_self on admins
  for select using (user_id = auth.uid());

drop policy if exists contests_admin on contests;
create policy contests_admin on contests
  for all using (is_admin()) with check (is_admin());

drop policy if exists rounds_admin on rounds;
create policy rounds_admin on rounds
  for all using (is_admin()) with check (is_admin());

drop policy if exists tasks_admin on tasks;
create policy tasks_admin on tasks
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- DEBUG · кезеңдер: оператор басқаруы, жіберілімдер, лидерборд
-- Supabase → SQL Editor → New query → осыны толық қойып, Run
-- (001 және 002 орындалғаннан кейін)
-- ============================================================

-- ---------- rounds: уақытты оператор басқарады ----------
alter table rounds add column if not exists status text not null default 'pending'
  check (status in ('pending', 'running', 'closed'));
alter table rounds add column if not exists started_at timestamptz;
alter table rounds add column if not exists ends_at    timestamptz;

-- ---------- contests: лидербордты жабу ----------
alter table contests add column if not exists board_locked       boolean not null default false;
alter table contests add column if not exists board_autolock_min int     not null default 10;

-- ---------- tasks: кезеңге тән өрістер ----------
alter table tasks add column if not exists variant           text check (variant in ('A', 'B')); -- Trace: null = бәріне
alter table tasks add column if not exists image_url         text;                  -- Trace: код суреті
alter table tasks add column if not exists entry             text;                  -- Debug/Build: функция аты
alter table tasks add column if not exists max_changed_lines int;                   -- Debug: әдетте 1
alter table tasks add column if not exists forbidden         text[] not null default '{}'; -- Build: мысалы {'set('}
alter table tasks add column if not exists tests_public      jsonb  not null default '[]'; -- [{args:[..], expected:"repr"}], оқушыға көрінеді
alter table tasks add column if not exists tests_hidden      jsonb  not null default '[]'; -- тек серверде

-- A/B нұсқаларында бір реттік нөмір екі рет кездеседі
alter table tasks drop constraint if exists tasks_round_id_idx_key;
alter table tasks drop constraint if exists tasks_round_idx_variant_key;
alter table tasks add constraint tasks_round_idx_variant_key unique nulls not distinct (round_id, idx, variant);

-- ---------- A/B нұсқасы: әр оқушыға бір жарысқа бекітіледі ----------
create table if not exists contest_variants (
  contest_id uuid not null references contests(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  variant    text not null check (variant in ('A', 'B')),
  primary key (contest_id, student_id)
);

-- ---------- жеке уақыт (+5 мин, интернеті үзілген оқушыға) ----------
create table if not exists round_extensions (
  round_id   uuid not null references rounds(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  extra_min  int  not null default 0 check (extra_min between 0 and 60),
  primary key (round_id, student_id)
);

-- ---------- жіберілімдер: бүкіл тарих сақталады, соңғысы есептеледі ----------
create table if not exists submissions (
  id          bigint generated always as identity primary key,
  contest_id  uuid not null references contests(id) on delete cascade,
  round_id    uuid not null references rounds(id)   on delete cascade,
  task_id     uuid not null references tasks(id)    on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  answer      text,                -- Trace: 'a'..'d'; Debug/Build: шығыстар тізімі (JSON)
  code        text,                -- Debug/Build: оқушының толық коды
  is_correct  boolean not null,
  points      int     not null default 0,
  reason      text,                -- 'wrong' | 'lines' | 'forbidden' | null
  created_at  timestamptz not null default now()
);
create index if not exists submissions_last_idx    on submissions (task_id, student_id, created_at desc, id desc);
create index if not exists submissions_contest_idx on submissions (contest_id, student_id);

-- ---------- «Феникс» үшін: кезең аяқталғандағы рейтинг ----------
create table if not exists rank_snapshots (
  contest_id uuid not null references contests(id) on delete cascade,
  round_idx  int  not null,
  student_id uuid not null references students(id) on delete cascade,
  rank       int  not null,
  score      int  not null,
  taken_at   timestamptz not null default now(),
  primary key (contest_id, round_idx, student_id)
);

-- ---------- RLS: анонимге бәрі жабық; жазу тек сервердің service role кілтімен ----------
alter table contest_variants enable row level security;
alter table round_extensions enable row level security;
alter table submissions      enable row level security;
alter table rank_snapshots   enable row level security;

drop policy if exists contest_variants_admin on contest_variants;
create policy contest_variants_admin on contest_variants for select using (is_admin());
drop policy if exists round_extensions_admin on round_extensions;
create policy round_extensions_admin on round_extensions for all using (is_admin()) with check (is_admin());
drop policy if exists submissions_admin on submissions;
create policy submissions_admin on submissions for select using (is_admin());
drop policy if exists rank_snapshots_admin on rank_snapshots;
create policy rank_snapshots_admin on rank_snapshots for select using (is_admin());

-- ---------- Рейтинг ----------
-- Әр тапсырма бойынша СОҢҒЫ жіберілім есептеледі (Apps Script-тегі «қайта жіберу алдыңғысын басады»).
-- Ұпай тең болса: соңғы есептелген дұрыс жауабы ертерек түскені жоғары.
-- Trace жүріп жатқанда оның жауаптары есептелмейді: әйтпесе оқушы нұсқаларды кезек басып,
-- ұпайының өзгеруінен дұрыс жауапты біліп қояды. Кезең жабылғанда бірден қосылады.
create or replace function contest_ranking(p_contest uuid)
returns table (rank int, student_id uuid, name text, score int, last_correct_at timestamptz, total int)
language sql stable security definer set search_path = public
as $$
  with last_sub as (
    select distinct on (s.task_id, s.student_id)
           s.student_id, s.is_correct, s.points, s.created_at
    from submissions s
    join rounds r on r.id = s.round_id
    where s.contest_id = p_contest
      and not (r.kind = 'mcq' and r.status = 'running')
    order by s.task_id, s.student_id, s.created_at desc, s.id desc
  ),
  per_student as (
    select student_id,
           coalesce(sum(case when is_correct then points end), 0)::int as score,
           max(case when is_correct then created_at end)               as last_correct_at
    from last_sub
    group by student_id
  )
  select (row_number() over (order by p.score desc, p.last_correct_at asc nulls last, st.full_name asc))::int,
         p.student_id, st.full_name, p.score, p.last_correct_at,
         (count(*) over ())::int
  from per_student p
  join students st on st.id = p.student_id
  order by 1;
$$;

create or replace function snapshot_ranks(p_contest uuid, p_round_idx int) returns void
language sql security definer set search_path = public
as $$
  delete from rank_snapshots where contest_id = p_contest and round_idx = p_round_idx;
  insert into rank_snapshots (contest_id, round_idx, student_id, rank, score)
  select p_contest, p_round_idx, r.student_id, r.rank, r.score from contest_ranking(p_contest) r;
$$;

-- ---------- Оператор әрекеттері (уақыт — дерекқордың сағатымен) ----------
create or replace function admin_start_round(p_round uuid) returns rounds
language plpgsql security definer set search_path = public
as $$
declare r rounds; prev rounds;
begin
  if not is_admin() then raise exception 'not admin'; end if;
  select * into r from rounds where id = p_round for update;
  if not found then raise exception 'round not found'; end if;

  -- бір жарыста бір уақытта тек бір кезең жүреді; алдыңғысы жабылып, рейтингі сақталады
  for prev in select * from rounds where contest_id = r.contest_id and status = 'running' and id <> p_round loop
    update rounds set status = 'closed', ends_at = least(coalesce(ends_at, now()), now()) where id = prev.id;
    perform snapshot_ranks(prev.contest_id, prev.idx);
  end loop;

  update rounds
     set status = 'running', started_at = now(), ends_at = now() + make_interval(mins => duration_min)
   where id = p_round
  returning * into r;

  update contests set status = 'running' where id = r.contest_id and status in ('draft', 'published');
  return r;
end $$;

create or replace function admin_extend_round(p_round uuid, p_min int) returns rounds
language plpgsql security definer set search_path = public
as $$
declare r rounds;
begin
  if not is_admin() then raise exception 'not admin'; end if;
  if p_min < 1 or p_min > 60 then raise exception 'bad minutes'; end if;
  update rounds set ends_at = greatest(ends_at, now()) + make_interval(mins => p_min)
   where id = p_round and status = 'running'
  returning * into r;
  if not found then raise exception 'round is not running'; end if;
  return r;
end $$;

create or replace function admin_close_round(p_round uuid) returns rounds
language plpgsql security definer set search_path = public
as $$
declare r rounds;
begin
  if not is_admin() then raise exception 'not admin'; end if;
  update rounds set status = 'closed', ends_at = least(coalesce(ends_at, now()), now())
   where id = p_round and status = 'running'
  returning * into r;
  if not found then raise exception 'round is not running'; end if;
  perform snapshot_ranks(r.contest_id, r.idx);
  return r;
end $$;

-- Әкімші панелі үшін (жүлдегерлерді қайта тексеру): сол рейтинг, бірақ тек әкімшіге
create or replace function admin_contest_ranking(p_contest uuid)
returns table (rank int, student_id uuid, name text, score int, last_correct_at timestamptz, total int)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not admin'; end if;
  return query select * from contest_ranking(p_contest);
end $$;

revoke all on function contest_ranking(uuid)          from public, anon, authenticated;
revoke all on function admin_contest_ranking(uuid)    from public, anon;
grant execute on function admin_contest_ranking(uuid)   to authenticated;
revoke all on function snapshot_ranks(uuid, int)      from public, anon, authenticated;
revoke all on function admin_start_round(uuid)        from public, anon;
revoke all on function admin_extend_round(uuid, int)  from public, anon;
revoke all on function admin_close_round(uuid)        from public, anon;
grant execute on function contest_ranking(uuid)         to service_role;
grant execute on function admin_start_round(uuid)       to authenticated;
grant execute on function admin_extend_round(uuid, int) to authenticated;
grant execute on function admin_close_round(uuid)       to authenticated;

-- ---------- Trace суреттері ----------
-- Файл аттары кездейсоқ UUID, сондықтан сілтемені болжау мүмкін емес; тізімін анонимді көре алмайды.
insert into storage.buckets (id, name, public) values ('task-images', 'task-images', true)
  on conflict (id) do nothing;

drop policy if exists "task-images admin insert" on storage.objects;
create policy "task-images admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-images' and public.is_admin());
drop policy if exists "task-images admin update" on storage.objects;
create policy "task-images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'task-images' and public.is_admin());
drop policy if exists "task-images admin delete" on storage.objects;
create policy "task-images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'task-images' and public.is_admin());

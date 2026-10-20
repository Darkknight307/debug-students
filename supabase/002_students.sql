-- ============================================================
-- DEBUG · Студенттер: сайтта тіркелген студенттер
-- 001_schema.sql-ден кейін. Supabase → SQL Editor → New query → осыны толық қойып, Run
-- ============================================================

-- Құпия сөз мұнда ЖОҚ: оны Supabase Auth (auth.users) хэштеп сақтайды.
-- Жол тек email расталған соң құрылады (растау өшірулі болса — тіркелген сәтте).
create table if not exists students (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique not null references auth.users(id) on delete cascade,
  email           text unique not null,
  last_name       text not null,
  first_name      text not null,
  full_name       text not null,          -- «Тегі Аты»: рейтинг пен талдау осыны қолданады
  university      text not null,
  course          text,
  phone           text,                   -- міндетті емес
  first_login_at  timestamptz not null default now(),
  last_login_at   timestamptz not null default now()
);

create index if not exists students_last_login_idx on students (last_login_at desc);
create index if not exists students_first_login_idx on students (first_login_at desc);

-- anon кілтіне мүлде жабық. Оқу тек әкімшіге, жазу тек сервердің service role кілтімен.
-- Студенттің өзі Supabase Auth-та болса да (authenticated рөлі), is_admin() false — ештеңе көрмейді.
alter table students enable row level security;

drop policy if exists students_admin_read on students;
create policy students_admin_read on students
  for select using (is_admin());

-- Әкімші панеліндегі «Email расталмаған» саны. auth.users-ке тек осы функция арқылы,
-- тек әкімші, тек санды көреді (email-дер шықпайды).
create or replace function admin_unconfirmed_count() returns int
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not admin'; end if;
  return (
    select count(*)::int from auth.users u
     where u.email_confirmed_at is null
       and not exists (select 1 from admins a where a.user_id = u.id)
  );
end $$;

revoke all on function admin_unconfirmed_count() from public, anon;
grant execute on function admin_unconfirmed_count() to authenticated;

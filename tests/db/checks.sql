-- RLS тексерісі: Supabase Auth-та аккаунты бар студент әкімші дерегіне қол жеткізе алмайды.
\set ON_ERROR_STOP on
create or replace function pg_temp.fails(q text) returns text language plpgsql as $$
begin
  execute q;
  return 'ӨТТІ';
exception when others then
  return 'тыйым';
end $$;

-- фикстура: әкімші, расталған студент, расталмаған тіркелу
insert into auth.users (id, email, email_confirmed_at) values
  ('a0000000-0000-4000-8000-00000000000a', 'admin@test', now()),
  ('b0000000-0000-4000-8000-00000000000b', 'student@test', now()),
  ('c0000000-0000-4000-8000-00000000000c', 'pending@test', null);
insert into admins (user_id, email) values ('a0000000-0000-4000-8000-00000000000a', 'admin@test');
insert into students (auth_user_id, email, last_name, first_name, full_name, university, course)
  values ('b0000000-0000-4000-8000-00000000000b', 'student@test', 'Серіков', 'Айдос', 'Серіков Айдос', 'Мок университеті', '2 курс');

\echo '--- студент (authenticated, әкімші емес)'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-00000000000b', true) is not null as jwt;
select 'students' as t, count(*) from students union all
select 'contests', count(*) from contests union all
select 'rounds', count(*) from rounds union all
select 'tasks', count(*) from tasks union all
select 'submissions', count(*) from submissions union all
select 'activity', count(*) from activity union all
select 'admins', count(*) from admins;
select pg_temp.fails('select admin_unconfirmed_count()') as unconfirmed_rpc,
       pg_temp.fails($q$select * from admin_contest_ranking((select id from contests limit 1))$q$) as admin_ranking,
       pg_temp.fails($q$select * from contest_ranking((select id from contests limit 1))$q$) as contest_ranking,
       pg_temp.fails($q$select admin_start_round(gen_random_uuid())$q$) as start_round,
       pg_temp.fails($q$insert into contests (slug, title, starts_at) values ('x', 'x', now())$q$) as insert_contest,
       pg_temp.fails($q$insert into admins (user_id) values ('b0000000-0000-4000-8000-00000000000b')$q$) as self_admin,
       pg_temp.fails($q$insert into students (auth_user_id, email, last_name, first_name, full_name, university)
                        values ('c0000000-0000-4000-8000-00000000000c', 'p@test', 'А', 'Б', 'А Б', 'У')$q$) as insert_student;
-- RLS астында UPDATE қате бермейді — көрінетін жол жоқ болғандықтан 0 жол өзгереді
with u as (update students set full_name = 'X' returning 1) select 'updated', count(*) from u;
rollback;

\echo '--- anon'
begin;
set local role anon;
select 'students' as t, count(*) from students union all select 'tasks', count(*) from tasks;
select pg_temp.fails('select admin_unconfirmed_count()') as unconfirmed_rpc;
rollback;

\echo '--- әкімші'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-00000000000a', true) is not null as jwt;
select (select count(*) from students) as students, (select count(*) from tasks) as tasks,
       admin_unconfirmed_count() as unconfirmed;
rollback;

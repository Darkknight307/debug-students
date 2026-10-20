-- Supabase-тің DEBUG қолданатын бөлігінің жергілікті «қуыршағы»: рөлдер, auth.users, auth.uid(), storage.
-- Тек tests/db/rls.sh үшін — нақты Supabase-те орындамаңыз.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'
);
-- PostgREST JWT-тің sub-ын осы баптаумен береді
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;

-- Supabase әдепкісі: public схемасындағы кестелер мен функцияларға рөлдердің бәріне рұқсат,
-- нақты қорғаныс — RLS пен функциялардағы is_admin() тексерісі.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

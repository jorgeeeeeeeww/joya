-- Lo mínimo de Supabase para correr la migración de hospedaje en la computadora (PGlite, sin Docker).
-- Imita los roles (anon, authenticated, service_role), auth.uid(), los perfiles con puesto,
-- el almacén de fotos, el tiempo real y las funciones del PWA que usa hospedaje.
-- En Supabase todo esto ya existe: este archivo solo se usa en la nube local.

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists realtime;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end
$$;

grant usage on schema public, extensions, auth, storage, realtime to anon, authenticated, service_role;
-- Como en Supabase: por omisión las tablas nuevas quedan abiertas y cada migración las cierra
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  instance_id uuid,
  aud text,
  role text,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;
grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'eventos', 'recepcion', 'limpieza', 'mantenimiento')),
  employee_id text,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

create table if not exists realtime.messages (
  id bigint generated always as identity primary key,
  topic text not null,
  extension text,
  event text,
  payload jsonb,
  private boolean,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to authenticated;
create or replace function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;
grant execute on function realtime.topic() to anon, authenticated;
-- En la nube local, «mandar por tiempo real» es un NOTIFY que el servidor reparte por WebSocket
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql as $$
  select pg_notify('realtime', jsonb_build_object('topic', topic, 'event', event, 'payload', payload, 'private', private)::text)
$$;

-- Del PWA (migración 20261104000000_pulido_nube.sql): llamar una función y registrar tareas
create or replace function public.edge_post(p_function text, p_body jsonb default '{}'::jsonb)
returns bigint language sql security definer set search_path = '' as $$
  select pg_notify('edge', p_function);
  select null::bigint;
$$;
revoke execute on function public.edge_post(text, jsonb) from public, anon, authenticated;

create table if not exists public.backend_runs (
  job text primary key,
  label text not null,
  ok boolean not null,
  last_run timestamptz not null default now(),
  last_ok timestamptz,
  detail text
);
alter table public.backend_runs enable row level security;
revoke all on public.backend_runs from anon, authenticated;
create or replace function public.record_backend_run(p_job text, p_label text, p_ok boolean, p_detail text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.backend_runs (job, label, ok, last_run, last_ok, detail)
  values (p_job, p_label, p_ok, now(), case when p_ok then now() end, left(p_detail, 600))
  on conflict (job) do update set label = excluded.label, ok = excluded.ok, last_run = excluded.last_run,
    last_ok = coalesce(excluded.last_ok, public.backend_runs.last_ok), detail = excluded.detail;
$$;
revoke execute on function public.record_backend_run(text, text, boolean, text) from public, anon, authenticated;

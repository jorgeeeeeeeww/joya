-- ════════════════════════════════════════════════════════════════════
-- Jardines La Joya · Esquema de base de datos (Supabase / Postgres)
-- Funciona igual en Supabase en la nube o instalado en la iMac (red local).
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Perfiles: une cada cuenta de Supabase Auth con un rol del sistema ──
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'eventos', 'recepcion', 'limpieza', 'mantenimiento')),
  employee_id text,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

drop policy if exists "perfil propio" on public.profiles;
create policy "perfil propio" on public.profiles
  for select using (id = auth.uid() or public.my_role() = 'admin');
drop policy if exists "admin administra perfiles" on public.profiles;
create policy "admin administra perfiles" on public.profiles
  for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ── Documentos: cada registro de la app (offline-first) ──
create table if not exists public.documents (
  collection text not null,
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (collection, id)
);
create index if not exists documents_updated_at_idx on public.documents (updated_at);
create index if not exists documents_collection_idx on public.documents (collection);
alter table public.documents enable row level security;

-- Qué colecciones puede LEER cada rol
create or replace function public.can_read(col text)
returns boolean
language sql
stable
as $$
  select case public.my_role()
    when 'admin' then true
    when 'eventos' then col in ('employees','units','reservations','events','payments','tasks','photos','inventory','notifications','audit','vendors','lostfound')
    when 'recepcion' then col in ('employees','units','reservations','payments','tasks','photos','inventory','notifications','lostfound')
    when 'limpieza' then col in ('employees','units','reservations','tasks','photos','inventory','notifications','lostfound')
    when 'mantenimiento' then col in ('employees','units','reservations','tasks','photos','inventory','notifications','lostfound')
    else false
  end
$$;

-- Qué colecciones puede ESCRIBIR cada rol
create or replace function public.can_write(col text)
returns boolean
language sql
stable
as $$
  select case public.my_role()
    when 'admin' then true
    when 'eventos' then col in ('events','payments','tasks','photos','inventory','notifications','audit','vendors','lostfound')
    when 'recepcion' then col in ('units','reservations','payments','tasks','photos','notifications','audit','lostfound')
    when 'limpieza' then col in ('units','tasks','photos','inventory','notifications','audit','lostfound')
    when 'mantenimiento' then col in ('units','tasks','photos','inventory','notifications','audit','lostfound')
    else false
  end
$$;

drop policy if exists "leer por rol" on public.documents;
create policy "leer por rol" on public.documents for select using (public.can_read(collection));
drop policy if exists "insertar por rol" on public.documents;
create policy "insertar por rol" on public.documents for insert with check (public.can_write(collection));
drop policy if exists "actualizar por rol" on public.documents;
create policy "actualizar por rol" on public.documents for update using (public.can_write(collection)) with check (public.can_write(collection));
-- Nadie borra filas físicamente desde la app: se marcan como deleted (borrado suave)

-- La bitácora no se puede reescribir: solo se agregan entradas nuevas
create or replace function public.protect_audit()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.collection = 'audit' then
    return old; -- ignora cualquier intento de modificar una entrada existente
  end if;
  return new;
end
$$;

-- Combinación campo por campo en el servidor (LWW por campo con data._ft).
-- Dos dispositivos que editan campos distintos del mismo registro no se pisan;
-- si editan el mismo campo, gana la edición más reciente. Un dispositivo atrasado
-- nunca borra cambios más nuevos.
create or replace function public.documents_lww()
returns trigger
language plpgsql
as $$
declare
  k text;
  merged jsonb;
  nft jsonb;
  oft jsonb;
  nts text;
  ots text;
begin
  if tg_op = 'UPDATE' then
    merged := old.data;
    nft := coalesce(new.data -> '_ft', '{}'::jsonb);
    oft := coalesce(old.data -> '_ft', '{}'::jsonb);
    for k in select jsonb_object_keys(new.data) loop
      continue when k in ('_ft', 'id', 'createdAt', 'updatedAt', 'updatedBy');
      nts := coalesce(nft ->> k, new.data ->> 'updatedAt', '');
      ots := coalesce(oft ->> k, old.data ->> 'updatedAt', '');
      if nts >= ots then
        merged := jsonb_set(merged, array[k], new.data -> k, true);
        oft := jsonb_set(oft, array[k], to_jsonb(nts), true);
      end if;
    end loop;
    merged := jsonb_set(merged, '{_ft}', oft, true);
    merged := jsonb_set(merged, '{updatedAt}', to_jsonb(greatest(coalesce(old.data ->> 'updatedAt', ''), coalesce(new.data ->> 'updatedAt', ''))), true);
    if (new.data ->> 'updatedAt') > coalesce(old.data ->> 'updatedAt', '') then
      merged := jsonb_set(merged, '{updatedBy}', coalesce(new.data -> 'updatedBy', 'null'::jsonb), true);
    end if;
    new.data := merged;
    new.deleted := coalesce((merged ->> 'deleted')::boolean, false);
  end if;
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end
$$;

drop trigger if exists documents_protect_audit on public.documents;
create trigger documents_protect_audit before update on public.documents
  for each row execute function public.protect_audit();
drop trigger if exists documents_lww on public.documents;
create trigger documents_lww before insert or update on public.documents
  for each row execute function public.documents_lww();

-- ── Historial de versiones (para recuperar cualquier cambio) ──
create table if not exists public.documents_history (
  history_id bigserial primary key,
  collection text not null,
  id text not null,
  data jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid
);
create index if not exists documents_history_doc_idx on public.documents_history (collection, id, changed_at desc);
alter table public.documents_history enable row level security;
drop policy if exists "solo admin ve historial" on public.documents_history;
create policy "solo admin ve historial" on public.documents_history for select using (public.my_role() = 'admin');

create or replace function public.documents_keep_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.documents_history (collection, id, data, changed_by)
  values (old.collection, old.id, old.data, auth.uid());
  return new;
end
$$;
drop trigger if exists documents_history_trg on public.documents;
create trigger documents_history_trg after update on public.documents
  for each row when (old.data is distinct from new.data)
  execute function public.documents_keep_history();

-- Limpieza del historial (> 180 días) para no crecer sin fin
create or replace function public.prune_history()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.documents_history where changed_at < now() - interval '180 days';
$$;

-- ── Tiempo real ──
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'documents') then
    alter publication supabase_realtime add table public.documents;
  end if;
end
$$;

-- ── Fotos: bucket privado, solo personal autenticado con rol ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "fotos leer" on storage.objects;
create policy "fotos leer" on storage.objects for select
  using (bucket_id = 'fotos' and public.my_role() is not null);
drop policy if exists "fotos subir" on storage.objects;
create policy "fotos subir" on storage.objects for insert
  with check (bucket_id = 'fotos' and public.my_role() is not null);
drop policy if exists "fotos reemplazar" on storage.objects;
create policy "fotos reemplazar" on storage.objects for update
  using (bucket_id = 'fotos' and public.my_role() is not null);
drop policy if exists "fotos borrar admin" on storage.objects;
create policy "fotos borrar admin" on storage.objects for delete
  using (bucket_id = 'fotos' and public.my_role() = 'admin');

-- ── Tareas programadas (requiere la extensión pg_cron, disponible en Supabase) ──
-- Descomenta después de crear las Edge Functions y guardar la llave de servicio en Vault:
-- select cron.schedule('ical-sync-30min', '*/30 * * * *', $$
--   select net.http_post(
--     url := 'https://TU-PROYECTO.supabase.co/functions/v1/ical-sync',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
--   );
-- $$);
-- select cron.schedule('prune-history', '0 4 * * 0', $$ select public.prune_history(); $$);

-- ── Notificaciones push (Web Push / VAPID) ──
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text,
  subscription jsonb not null,
  device text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "suscripcion propia" on public.push_subscriptions;
create policy "suscripcion propia" on public.push_subscriptions
  for all using (user_id = auth.uid() or public.my_role() = 'admin') with check (user_id = auth.uid());

-- Para enviar push al crear avisos: en Supabase → Database → Webhooks crea un webhook
-- "INSERT en public.documents" hacia la Edge Function push-send (ver docs/PUESTA-EN-MARCHA.md).

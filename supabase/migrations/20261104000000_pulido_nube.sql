-- ════════════════════════════════════════════════════════════════════
-- Pulido de la nube (noviembre 2026)
--  1. Seguridad: funciones con search_path fijo, funciones internas fuera de la API pública,
--     la tabla de datos cerrada para quien no ha iniciado sesión.
--  2. Reglas por rol más rápidas: el rol se calcula una vez por consulta, no una vez por registro.
--  3. Avisos push: el puesto (rol) lo pone el servidor, no el celular.
--  4. Versión mínima de la app (app_config).
--  5. Tiempo real por Broadcast privado: la base solo avisa «hubo cambios».
--  6. Monitor central: dispositivos, errores agrupados, tareas del backend y alertas al dueño.
--  7. Tareas programadas (Airbnb/Booking, monitor, limpieza) y avisos push sin webhooks del panel,
--     con los secretos guardados en Vault.
-- Se puede aplicar varias veces sin romper nada.
-- ════════════════════════════════════════════════════════════════════

-- ── 1 y 2. Rol del usuario y colecciones permitidas ──────────────────
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

-- Colecciones que cada rol puede LEER / ESCRIBIR (null = todas, para admin)
create or replace function public.readable_collections()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case public.my_role()
    when 'admin' then null
    when 'eventos' then array['employees','units','reservations','events','payments','tasks','photos','inventory','notifications','audit','vendors','lostfound']
    when 'recepcion' then array['employees','units','reservations','payments','tasks','photos','inventory','notifications','lostfound']
    when 'limpieza' then array['employees','units','reservations','tasks','photos','inventory','notifications','lostfound']
    when 'mantenimiento' then array['employees','units','reservations','tasks','photos','inventory','notifications','lostfound']
    else array[]::text[]
  end
$$;

create or replace function public.writable_collections()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case public.my_role()
    when 'admin' then null
    when 'eventos' then array['events','payments','tasks','photos','inventory','notifications','audit','vendors','lostfound']
    when 'recepcion' then array['units','reservations','payments','tasks','photos','notifications','audit','lostfound']
    when 'limpieza' then array['units','tasks','photos','inventory','notifications','audit','lostfound']
    when 'mantenimiento' then array['units','tasks','photos','inventory','notifications','audit','lostfound']
    else array[]::text[]
  end
$$;

-- Las anteriores se quedan (compatibilidad), con search_path fijo
create or replace function public.can_read(col text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.my_role() = 'admin' or col = any (coalesce(public.readable_collections(), array[]::text[]))
$$;

create or replace function public.can_write(col text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.my_role() = 'admin' or col = any (coalesce(public.writable_collections(), array[]::text[]))
$$;

alter function public.protect_audit() set search_path = '';
alter function public.documents_lww() set search_path = '';
alter function public.documents_keep_history() set search_path = '';
alter function public.prune_history() set search_path = '';

-- Funciones internas: nadie las llama desde la app (los triggers funcionan igual)
revoke execute on function public.protect_audit() from public, anon, authenticated;
revoke execute on function public.documents_lww() from public, anon, authenticated;
revoke execute on function public.documents_keep_history() from public, anon, authenticated;
revoke execute on function public.prune_history() from public, anon, authenticated;
-- Las de rol se usan dentro de las reglas: solo para cuentas con sesión
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.readable_collections() from public, anon;
revoke execute on function public.writable_collections() from public, anon;
revoke execute on function public.can_read(text) from public, anon;
revoke execute on function public.can_write(text) from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.readable_collections() to authenticated;
grant execute on function public.writable_collections() to authenticated;
grant execute on function public.can_read(text) to authenticated;
grant execute on function public.can_write(text) to authenticated;

-- Sin sesión no se ve ni se toca nada
revoke all on public.documents from anon;
revoke all on public.documents_history from anon;
revoke all on public.profiles from anon;
revoke all on public.push_subscriptions from anon;

-- Reglas por rol: (select …) hace que Postgres calcule el rol una sola vez por consulta.
-- El ::text[] es necesario: sin él, «any» toma el select como lista de filas y compara texto contra arreglo.
drop policy if exists "leer por rol" on public.documents;
create policy "leer por rol" on public.documents for select to authenticated
  using ((select public.my_role()) = 'admin' or collection = any ((select public.readable_collections())::text[]));
drop policy if exists "insertar por rol" on public.documents;
create policy "insertar por rol" on public.documents for insert to authenticated
  with check ((select public.my_role()) = 'admin' or collection = any ((select public.writable_collections())::text[]));
drop policy if exists "actualizar por rol" on public.documents;
create policy "actualizar por rol" on public.documents for update to authenticated
  using ((select public.my_role()) = 'admin' or collection = any ((select public.writable_collections())::text[]))
  with check ((select public.my_role()) = 'admin' or collection = any ((select public.writable_collections())::text[]));

drop policy if exists "perfil propio" on public.profiles;
create policy "perfil propio" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.my_role()) = 'admin');
drop policy if exists "admin administra perfiles" on public.profiles;
create policy "admin administra perfiles" on public.profiles for all to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');

drop policy if exists "solo admin ve historial" on public.documents_history;
create policy "solo admin ve historial" on public.documents_history for select to authenticated
  using ((select public.my_role()) = 'admin');

drop policy if exists "fotos leer" on storage.objects;
create policy "fotos leer" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (select public.my_role()) is not null);
drop policy if exists "fotos subir" on storage.objects;
create policy "fotos subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (select public.my_role()) is not null);
drop policy if exists "fotos reemplazar" on storage.objects;
create policy "fotos reemplazar" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (select public.my_role()) is not null);
drop policy if exists "fotos borrar admin" on storage.objects;
create policy "fotos borrar admin" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (select public.my_role()) = 'admin');

-- ── 3. Avisos push: el rol lo pone el servidor ───────────────────────
create or replace function public.push_subscription_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.user_id := (select auth.uid());
  end if;
  -- El puesto sale de la cuenta, nunca de lo que mande el celular
  new.role := (select p.role from public.profiles p where p.id = new.user_id);
  return new;
end
$$;
revoke execute on function public.push_subscription_owner() from public, anon, authenticated;
drop trigger if exists push_subscription_owner on public.push_subscriptions;
create trigger push_subscription_owner before insert or update on public.push_subscriptions
  for each row execute function public.push_subscription_owner();

drop policy if exists "suscripcion propia" on public.push_subscriptions;
create policy "suscripcion propia" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()) or (select public.my_role()) = 'admin')
  with check (user_id = (select auth.uid()));

-- ── 4. Configuración de la app (versión mínima) ──────────────────────
create table if not exists public.app_config (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon;
drop policy if exists "equipo lee configuracion" on public.app_config;
create policy "equipo lee configuracion" on public.app_config for select to authenticated
  using ((select public.my_role()) is not null);
drop policy if exists "admin cambia configuracion" on public.app_config;
create policy "admin cambia configuracion" on public.app_config for all to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');
-- min_build: los dispositivos con una versión anterior se actualizan antes de subir cambios.
-- Formato AAAAMMDDHHmm (lo pone la publicación). Para exigir una versión:
--   update public.app_config set value = '202611041530' where key = 'min_build';
insert into public.app_config (key, value) values ('min_build', '000000000000') on conflict (key) do nothing;

-- ── 5. Tiempo real por Broadcast privado ─────────────────────────────
-- La base solo avisa «hubo cambios» (sin datos); cada dispositivo baja lo nuevo con sus propios permisos.
create or replace function public.documents_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('at', clock_timestamp()), 'cambio', 'documentos', true);
  return null;
exception when others then
  -- Si el tiempo real falla, guardar nunca falla (los dispositivos igual bajan cada 45 s)
  return null;
end
$$;
revoke execute on function public.documents_broadcast() from public, anon, authenticated;
drop trigger if exists documents_broadcast on public.documents;
create trigger documents_broadcast after insert or update on public.documents
  for each statement execute function public.documents_broadcast();

-- Quién puede escuchar los avisos y la presencia del equipo (canales privados)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    execute 'drop policy if exists "equipo escucha avisos" on realtime.messages';
    execute $p$create policy "equipo escucha avisos" on realtime.messages for select to authenticated
      using ((select realtime.topic()) in ('documentos', 'presencia') and (select public.my_role()) is not null)$p$;
    execute 'drop policy if exists "equipo comparte presencia" on realtime.messages';
    execute $p$create policy "equipo comparte presencia" on realtime.messages for insert to authenticated
      with check ((select realtime.topic()) = 'presencia' and extension = 'presence' and (select public.my_role()) is not null)$p$;
  end if;
end
$$;

-- Ya no se mandan las filas completas por tiempo real
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents') then
    alter publication supabase_realtime drop table public.documents;
  end if;
end
$$;

-- ── 6. Monitor central ───────────────────────────────────────────────
-- Estado de cada dispositivo (lo manda el propio dispositivo cada pocos minutos)
create table if not exists public.devices (
  device_id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_email text,
  employee_id text,
  employee_name text,
  employee_role text,
  app_build text not null default '',
  app_version text,
  platform text,
  last_seen timestamptz not null default now(),
  last_sync_at timestamptz,
  pending_count integer not null default 0 check (pending_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  sync_status text,
  sync_error text check (char_length(sync_error) <= 400),
  realtime text,
  storage_mb numeric,
  version_since timestamptz not null default now(),
  first_seen timestamptz not null default now()
);
alter table public.devices enable row level security;
revoke all on public.devices from anon;

create or replace function public.devices_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.user_id := (select auth.uid());
  end if;
  new.account_email := (select u.email from auth.users u where u.id = new.user_id);
  -- La hora la pone el servidor (los relojes de los celulares pueden estar mal)
  new.last_seen := now();
  if new.last_sync_at > now() then
    new.last_sync_at := now();
  end if;
  if tg_op = 'INSERT' then
    new.first_seen := now();
    new.version_since := now();
  else
    new.first_seen := old.first_seen;
    new.version_since := case when new.app_build is distinct from old.app_build then now() else old.version_since end;
  end if;
  return new;
end
$$;
revoke execute on function public.devices_stamp() from public, anon, authenticated;
drop trigger if exists devices_stamp on public.devices;
create trigger devices_stamp before insert or update on public.devices
  for each row execute function public.devices_stamp();

drop policy if exists "dispositivo propio" on public.devices;
create policy "dispositivo propio" on public.devices for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.my_role()) is not null);
drop policy if exists "dispositivo propio actualiza" on public.devices;
create policy "dispositivo propio actualiza" on public.devices for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "dispositivo propio o admin lee" on public.devices;
create policy "dispositivo propio o admin lee" on public.devices for select to authenticated
  using (user_id = (select auth.uid()) or (select public.my_role()) = 'admin');
drop policy if exists "admin quita dispositivos" on public.devices;
create policy "admin quita dispositivos" on public.devices for delete to authenticated
  using ((select public.my_role()) = 'admin');

-- Errores de todos los dispositivos (solo el error, la pantalla y la versión; nunca datos del rancho)
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  device_id text not null,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  employee_id text,
  employee_role text,
  app_build text,
  page text check (char_length(page) <= 200),
  source text not null check (source in ('pantalla', 'promesa', 'sync', 'consola', 'permiso')),
  message text not null check (char_length(message) <= 400),
  detail text check (char_length(detail) <= 1200),
  fingerprint text not null default '',
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
create index if not exists client_errors_fp_idx on public.client_errors (fingerprint, created_at desc);
create index if not exists client_errors_device_idx on public.client_errors (device_id, created_at desc);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon;

create or replace function public.client_errors_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := (select auth.uid());
  new.created_at := now();
  if new.happened_at > now() or new.happened_at < now() - interval '30 days' then
    new.happened_at := now();
  end if;
  -- El mismo error con distintos números (ids, horas) se agrupa como uno solo
  new.fingerprint := md5(new.source || ':' || regexp_replace(lower(new.message), '[0-9a-f]{8,}|[0-9]+', '#', 'g'));
  return new;
end
$$;
revoke execute on function public.client_errors_stamp() from public, anon, authenticated;
drop trigger if exists client_errors_stamp on public.client_errors;
create trigger client_errors_stamp before insert on public.client_errors
  for each row execute function public.client_errors_stamp();

drop policy if exists "equipo reporta errores" on public.client_errors;
create policy "equipo reporta errores" on public.client_errors for insert to authenticated
  with check ((select public.my_role()) is not null);
drop policy if exists "admin ve errores" on public.client_errors;
create policy "admin ve errores" on public.client_errors for select to authenticated
  using ((select public.my_role()) = 'admin');

-- Último resultado de cada tarea del backend (funciones, tareas programadas, respaldo)
create table if not exists public.backend_runs (
  job text primary key,
  label text not null,
  ok boolean not null,
  last_run timestamptz not null default now(),
  last_ok timestamptz,
  detail text
);
alter table public.backend_runs enable row level security;
revoke all on public.backend_runs from anon;
drop policy if exists "admin ve backend" on public.backend_runs;
create policy "admin ve backend" on public.backend_runs for select to authenticated
  using ((select public.my_role()) = 'admin');

create or replace function public.record_backend_run(p_job text, p_label text, p_ok boolean, p_detail text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.backend_runs (job, label, ok, last_run, last_ok, detail)
  values (p_job, p_label, p_ok, now(), case when p_ok then now() end, left(p_detail, 600))
  on conflict (job) do update set
    label = excluded.label,
    ok = excluded.ok,
    last_run = excluded.last_run,
    last_ok = coalesce(excluded.last_ok, public.backend_runs.last_ok),
    detail = excluded.detail;
$$;
-- Solo la llave secreta (funciones, GitHub Actions) y las tareas programadas
revoke execute on function public.record_backend_run(text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.record_backend_run(text, text, boolean, text) to service_role;

-- Vista del dueño: cada dispositivo con su semáforo
create or replace view public.device_health with (security_invoker = true) as
with cfg as (
  select
    (select value from public.app_config where key = 'min_build') as min_build,
    (select max(app_build) from public.devices where last_seen > now() - interval '7 days') as latest_build
),
latest as (
  select min(d.version_since) as latest_since from public.devices d, cfg where d.app_build = cfg.latest_build
),
d as (
  select
    dev.*,
    (select count(*) from public.client_errors e where e.device_id = dev.device_id and e.created_at > now() - interval '24 hours')::int as errors_24h,
    (dev.pending_count > 0 and coalesce(dev.last_sync_at, dev.first_seen) < now() - interval '2 hours') as stuck,
    (cfg.min_build is not null and dev.app_build < cfg.min_build) as below_min,
    (cfg.latest_build is not null and dev.app_build < cfg.latest_build and now() > latest.latest_since + interval '1 day') as outdated
  from public.devices dev, cfg, latest
)
select
  device_id, user_id, account_email, employee_id, employee_name, employee_role, app_build, app_version, platform,
  last_seen, last_sync_at, pending_count, rejected_count, sync_status, sync_error, realtime, storage_mb, version_since, first_seen,
  errors_24h,
  case
    when stuck or below_min or rejected_count > 0 or (sync_status = 'error' and last_seen > now() - interval '1 day') then 'rojo'
    when outdated or errors_24h >= 5 or last_seen < now() - interval '2 days' then 'amarillo'
    else 'verde'
  end as health,
  case
    when stuck then format('%s %s sin subir desde hace más de 2 horas', pending_count, case when pending_count = 1 then 'cambio' else 'cambios' end)
    when below_min then 'Versión más vieja de la que pide la nube'
    when rejected_count > 0 then format('La nube rechazó %s %s por permisos', rejected_count, case when rejected_count = 1 then 'cambio' else 'cambios' end)
    when sync_status = 'error' and last_seen > now() - interval '1 day' then coalesce(sync_error, 'Error al sincronizar')
    when outdated then 'Sigue en una versión anterior'
    when errors_24h >= 5 then format('%s errores en las últimas 24 horas', errors_24h)
    when last_seen < now() - interval '2 days' then 'No se ha abierto en más de 2 días'
  end as health_reason
from d;

-- Errores agrupados: el mismo error en varios celulares se ve una sola vez
create or replace view public.client_error_groups with (security_invoker = true) as
select
  fingerprint,
  min(source) as source,
  (array_agg(message order by created_at desc))[1] as sample_message,
  (array_agg(page order by created_at desc))[1] as sample_page,
  count(*)::int as occurrences,
  count(distinct device_id)::int as devices,
  min(happened_at) as first_seen,
  max(happened_at) as last_seen
from public.client_errors
where created_at > now() - interval '30 days'
group by fingerprint;

grant select on public.device_health to authenticated;
grant select on public.client_error_groups to authenticated;
revoke all on public.device_health from anon;
revoke all on public.client_error_groups from anon;

-- Alertas al dueño (sin repetir la misma en 12 horas)
create table if not exists public.monitor_alerts (
  key text primary key,
  sent_at timestamptz not null default now()
);
alter table public.monitor_alerts enable row level security;
revoke all on public.monitor_alerts from anon, authenticated;

create or replace function public.monitor_alert(p_key text, p_title text, p_body text, p_link text default '/desarrollador')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  nid text := 'not_mon_' || substr(md5(p_key || clock_timestamp()::text), 1, 16);
  ts text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if exists (select 1 from public.monitor_alerts where key = p_key and sent_at > now() - interval '12 hours') then
    return 0;
  end if;
  insert into public.monitor_alerts (key, sent_at) values (p_key, now())
    on conflict (key) do update set sent_at = excluded.sent_at;
  -- Se guarda como un aviso más de la app (llega como aviso push al dueño)
  insert into public.documents (collection, id, data, deleted)
  values ('notifications', nid, jsonb_build_object(
    'id', nid, 'title', p_title, 'body', p_body, 'tone', 'rose', 'link', p_link,
    'roles', jsonb_build_array('admin'), 'read', false, 'createdAt', ts, 'updatedAt', ts
  ), false);
  return 1;
end
$$;
revoke execute on function public.monitor_alert(text, text, text, text) from public, anon, authenticated;

-- Revisa todo y avisa al dueño. Corre cada 15 minutos (pg_cron).
create or replace function public.monitor_check()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  r record;
  hora text;
begin
  for r in select * from public.device_health where last_seen > now() - interval '7 days' loop
    hora := to_char(coalesce(r.last_sync_at, r.first_seen) at time zone 'America/Mexico_City', 'DD/MM HH24:MI');
    if r.pending_count > 0 and coalesce(r.last_sync_at, r.first_seen) < now() - interval '2 hours' then
      n := n + public.monitor_alert('pendientes:' || r.device_id, 'Un dispositivo no ha subido sus cambios',
        format('%s (%s) tiene %s cambios sin subir desde el %s.', coalesce(r.employee_name, r.account_email, 'Sin nombre'), coalesce(r.platform, 'dispositivo'), r.pending_count, hora));
    end if;
    if r.health_reason in ('Versión más vieja de la que pide la nube', 'Sigue en una versión anterior') then
      n := n + public.monitor_alert('version:' || r.device_id || ':' || r.app_build, 'Un dispositivo sigue en una versión vieja',
        format('%s (%s) no se ha actualizado. Ábrelo y desliza hacia abajo para buscar la versión nueva.', coalesce(r.employee_name, r.account_email, 'Sin nombre'), coalesce(r.platform, 'dispositivo')));
    end if;
  end loop;

  for r in
    select fingerprint, (array_agg(message order by created_at desc))[1] as msg, count(*) as c, count(distinct device_id) as d
    from public.client_errors where created_at > now() - interval '1 hour' and source <> 'permiso'
    group by fingerprint having count(*) >= 20
  loop
    n := n + public.monitor_alert('error:' || r.fingerprint, 'Un error se está repitiendo',
      format('«%s» pasó %s veces en la última hora en %s dispositivos.', left(r.msg, 120), r.c, r.d));
  end loop;

  for r in
    select e.device_id, count(*) as c, max(coalesce(dv.employee_name, dv.account_email)) as who
    from public.client_errors e left join public.devices dv on dv.device_id = e.device_id
    where e.source = 'permiso' and e.created_at > now() - interval '1 hour'
    group by e.device_id
  loop
    n := n + public.monitor_alert('permiso:' || r.device_id, 'La nube rechazó cambios por permisos',
      format('Los cambios de %s no se guardaron en la nube porque su puesto no tiene permiso. Revisa su cuenta.', coalesce(r.who, 'un dispositivo')));
  end loop;

  for r in select * from public.backend_runs where not ok and last_run > now() - interval '1 day' loop
    n := n + public.monitor_alert('backend:' || r.job || ':' || to_char(r.last_run, 'YYYYMMDDHH24'), 'Falló una tarea de la nube',
      format('%s falló: %s', r.label, coalesce(left(r.detail, 160), 'sin detalle')));
  end loop;

  perform public.record_backend_run('monitor', 'Monitor central', true, format('%s alertas enviadas', n));
  return n;
exception when others then
  perform public.record_backend_run('monitor', 'Monitor central', false, sqlerrm);
  return n;
end
$$;
revoke execute on function public.monitor_check() from public, anon, authenticated;

-- Limpieza diaria: historial de más de 180 días, errores de más de 90, alertas viejas
create or replace function public.cron_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h bigint;
  e bigint;
begin
  delete from public.documents_history where changed_at < now() - interval '180 days';
  get diagnostics h = row_count;
  delete from public.client_errors where created_at < now() - interval '90 days';
  get diagnostics e = row_count;
  delete from public.monitor_alerts where sent_at < now() - interval '30 days';
  perform public.record_backend_run('limpieza', 'Limpieza del historial', true, format('%s versiones y %s errores viejos borrados', h, e));
exception when others then
  perform public.record_backend_run('limpieza', 'Limpieza del historial', false, sqlerrm);
end
$$;
revoke execute on function public.cron_cleanup() from public, anon, authenticated;

-- ── 7. Llamar a las funciones de Supabase desde la base (secretos en Vault) ──
-- Secretos necesarios en Vault (ver docs/PUESTA-EN-MARCHA.md):
--   project_url  → https://TU-PROYECTO.supabase.co
--   cron_secret  → texto largo al azar; el mismo va en los secretos de las funciones (CRON_SECRET)
create extension if not exists pg_net with schema extensions;

create or replace function public.edge_post(p_function text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  secret text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if base is null or secret is null then
    perform public.record_backend_run('vault', 'Secretos en Vault', false, 'Faltan project_url o cron_secret en Vault');
    return null;
  end if;
  return net.http_post(
    url := rtrim(base, '/') || '/functions/v1/' || p_function,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    timeout_milliseconds := 15000
  );
end
$$;
revoke execute on function public.edge_post(text, jsonb) from public, anon, authenticated;

-- Avisos push: cada aviso nuevo se manda a la función push-send (reemplaza el webhook del panel)
create or replace function public.notify_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.edge_post('push-send', jsonb_build_object('record', jsonb_build_object('collection', new.collection, 'id', new.id, 'data', new.data, 'deleted', new.deleted)));
  return null;
exception when others then
  -- Si falla el aviso, guardar nunca falla
  return null;
end
$$;
revoke execute on function public.notify_push() from public, anon, authenticated;
drop trigger if exists notify_push on public.documents;
create trigger notify_push after insert on public.documents
  for each row when (new.collection = 'notifications' and not new.deleted)
  execute function public.notify_push();

-- Tareas programadas
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('la-joya-airbnb-booking', '*/30 * * * *', $c$ select public.edge_post('ical-sync', '{}'::jsonb) $c$);
  perform cron.schedule('la-joya-monitor', '*/15 * * * *', $c$ select public.monitor_check() $c$);
  perform cron.schedule('la-joya-limpieza', '20 10 * * *', $c$ select public.cron_cleanup() $c$);
exception when others then
  raise notice 'Tareas programadas sin configurar (pg_cron no disponible): %', sqlerrm;
end
$$;

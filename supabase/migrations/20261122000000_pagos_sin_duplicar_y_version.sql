-- Conexión de la app de la Mac (22 nov 2026): dos arreglos de la auditoría.
--
-- 1) Un pago no se puede registrar dos veces. La app manda un identificador propio con cada pago; si la misma
--    petición llega dos veces (la respuesta se perdió y se reintentó), la base reconoce el pago y no lo repite.
--
-- 2) Sondeo ligero. La app revisaba cada 30 s bajando TODO (hosp_datos). Ahora pregunta primero «¿cambió algo?»
--    con hosp_version(), que contesta un número, y solo baja todo si ese número cambió.
--
-- Se puede aplicar antes o después de actualizar la app: la app vieja sigue funcionando con estas funciones y la
-- app nueva, si no encuentra hosp_version, baja todo como antes.

-- ── Versión de los datos ─────────────────────────────────────────────
-- Un contador que sube con cada cambio en las tablas de hospedaje. Es una secuencia y no un renglón a propósito:
-- un renglón se quedaría con candado hasta el final de cada cambio y dos cambios a la vez podrían estorbarse.
-- Como la secuencia sube antes de que el cambio quede guardado, la app vuelve a bajar todo una vez más en su
-- siguiente revisión después de cada cambio (store.ts): así nunca se queda con datos de un instante antes.
create sequence if not exists public.hospedaje_version_seq;
revoke all on sequence public.hospedaje_version_seq from public, anon, authenticated;

create or replace function public.hosp_avisar_cambio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform nextval('public.hospedaje_version_seq');
  exception when others then
    null; -- guardar nunca falla por el contador (la app también baja todo cada 5 minutos)
  end;
  perform realtime.send(jsonb_build_object('tabla', tg_table_name, 'at', clock_timestamp()), 'cambio', 'hospedaje', true);
  return null;
exception when others then
  return null; -- si el tiempo real falla, guardar nunca falla (la app también revisa cada 30 s)
end
$$;

-- Lo mínimo para saber si hay que volver a bajar: el contador, el día de hoy (cambia a medianoche) y los correos
-- sin enviar (esa tabla no mueve el contador). También vence los apartados, como hacía cada lectura completa.
create or replace function public.hosp_version()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.hosp_exigir_equipo();
  perform public.vencer_solicitudes();
  return jsonb_build_object(
    'v', (select last_value from public.hospedaje_version_seq),
    'hoy', public.hosp_hoy(),
    'avisos_sin_enviar', (select count(*) from public.hospedaje_avisos where estado in ('error', 'sin_configurar') and creado > now() - interval '7 days')
  );
end
$$;
revoke all on function public.hosp_version() from public, anon, authenticated;
grant execute on function public.hosp_version() to authenticated;

-- hosp_datos: igual que antes, más «version» (leída antes que los datos: si algo cambia en medio, la siguiente
-- revisión lo nota y vuelve a bajar).
create or replace function public.hosp_datos(p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hoy date := public.hosp_hoy();
  desde date := coalesce(p_desde, hoy - 60);
  hasta date := coalesce(p_hasta, hoy + 400);
  v_version bigint;
begin
  perform public.hosp_exigir_equipo();
  perform public.vencer_solicitudes();
  select last_value into v_version from public.hospedaje_version_seq;
  return jsonb_build_object(
    'hoy', hoy,
    'ahora', now(),
    'desde', desde,
    'hasta', hasta,
    'version', v_version,
    'es_admin', public.hosp_es_admin(),
    'ajustes', (select to_jsonb(a) - 'id' from public.hospedaje_ajustes a where a.id),
    'cabanas', coalesce((select jsonb_agg(to_jsonb(c) order by c.orden, c.nombre) from public.cabanas c), '[]'::jsonb),
    'temporadas', coalesce((select jsonb_agg(to_jsonb(t) order by t.desde) from public.temporadas t), '[]'::jsonb),
    'reservaciones', coalesce((
      select jsonb_agg((to_jsonb(r) - 'token' - 'desglose') || jsonb_build_object(
        'pagado', coalesce((select sum(p.monto) from public.pagos p where p.reservacion_id = r.id), 0)
      ) order by r.llegada, r.creada)
      from public.reservaciones r
      where (r.salida >= desde and r.llegada <= hasta) or r.estado = 'solicitud'
    ), '[]'::jsonb),
    'bloqueos', coalesce((select jsonb_agg(to_jsonb(b) order by b.inicio) from public.bloqueos b where b.fin >= desde and b.inicio <= hasta), '[]'::jsonb),
    'avisos_sin_enviar', (select count(*) from public.hospedaje_avisos where estado in ('error', 'sin_configurar') and creado > now() - interval '7 days')
  );
end
$$;

-- ── Pagos sin duplicar ───────────────────────────────────────────────
-- «id» es opcional (la app anterior no lo manda). Con id, repetir la misma petición no crea otro pago.
create or replace function public.hosp_registrar_pago(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_res uuid := (p ->> 'reservacion_id')::uuid;
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  n integer;
begin
  perform public.hosp_exigir_equipo();
  if not exists (select 1 from public.reservaciones where id = v_res) then
    raise exception 'No encontramos esa reservación' using errcode = 'P0002';
  end if;
  begin
    insert into public.pagos (id, reservacion_id, monto, metodo, fecha, referencia)
    values (coalesce(v_id, gen_random_uuid()), v_res, (p ->> 'monto')::numeric, coalesce(nullif(p ->> 'metodo', ''), 'transferencia'),
      coalesce(nullif(p ->> 'fecha', '')::date, public.hosp_hoy()), nullif(btrim(p ->> 'referencia'), ''))
    on conflict (id) do nothing;
    get diagnostics n = row_count;
  exception when check_violation or not_null_violation then
    raise exception 'Revisa el monto y el método del pago' using errcode = '23514';
  end;
  -- Ya existía: solo es válido si es este mismo pago de esta misma reservación
  if n = 0 and not exists (select 1 from public.pagos where id = v_id and reservacion_id = v_res) then
    raise exception 'Ese pago ya está registrado en otra reservación' using errcode = '23505';
  end if;
  return public.hosp_reservacion_json(v_res);
end
$$;

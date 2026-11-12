-- Avisos por WhatsApp (CallMeBot): el dueño recibe un mensaje en su celular por cada solicitud nueva de la página.
-- Va por el mismo camino que los correos (tabla hospedaje_avisos → función avisos-hospedaje); solo cambia el «canal».
-- El teléfono y la clave de CallMeBot NO están en la base: son secretos de la función (CALLMEBOT_TELEFONO, CALLMEBOT_APIKEY).

alter table public.hospedaje_avisos
  add column if not exists canal text not null default 'correo' check (canal in ('correo', 'whatsapp'));

-- La función de avisos ahora también recibe el canal de cada aviso
create or replace function public.hosp_tomar_avisos()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j jsonb;
begin
  -- Los que se quedaron «enviando» más de 10 minutos se vuelven a intentar
  update public.hospedaje_avisos set estado = 'pendiente', actualizado = now()
  where estado = 'enviando' and actualizado < now() - interval '10 minutes';
  with t as (
    select id from public.hospedaje_avisos
    where estado = 'pendiente' and intentos < 5
    order by creado limit 20
    for update skip locked
  ), u as (
    update public.hospedaje_avisos a set estado = 'enviando', intentos = a.intentos + 1, actualizado = now()
    from t where a.id = t.id
    returning a.id, a.canal, a.para, a.asunto, a.cuerpo
  )
  select coalesce(jsonb_agg(to_jsonb(u) order by u.id), '[]'::jsonb) into j from u;
  return j;
end
$$;

-- Cada solicitud nueva de la página deja un aviso de WhatsApp. Lleva solo lo necesario (nombre de pila, hospedaje,
-- fechas y total): el mensaje pasa por los servidores de CallMeBot, así que no va ni el teléfono ni el correo del huésped.
-- Un aviso que falla nunca debe impedir una reservación.
create or replace function public.hosp_whatsapp_solicitud()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cab text;
  noches integer := new.salida - new.llegada;
begin
  if new.origen <> 'web' then
    return null;
  end if;
  select nombre into cab from public.cabanas where id = new.cabana_id;
  insert into public.hospedaje_avisos (reservacion_id, canal, para, asunto, cuerpo)
  values (new.id, 'whatsapp', 'whatsapp', 'Nueva solicitud ' || new.codigo,
    format('Nueva solicitud %s: %s · %s · %s (%s %s, %s %s) · Total %s. Ábrela en la app La Joya.',
      new.codigo, split_part(new.nombre, ' ', 1), cab, public.hosp_rango(new.llegada, new.salida),
      noches, case when noches = 1 then 'noche' else 'noches' end,
      new.huespedes, case when new.huespedes = 1 then 'persona' else 'personas' end,
      public.hosp_dinero(new.total)));
  return null;
exception when others then
  return null;
end
$$;
drop trigger if exists reservaciones_whatsapp on public.reservaciones;
create trigger reservaciones_whatsapp after insert on public.reservaciones
  for each row execute function public.hosp_whatsapp_solicitud();

-- Botón «Probar WhatsApp» de la app (solo el dueño): deja un aviso de prueba y luego se consulta cómo le fue.
-- Nace con 4 intentos gastados: si falla, no se reintenta solo (así no llegan pruebas viejas cuando se corrija la clave).
create or replace function public.hosp_probar_whatsapp()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform public.hosp_exigir_admin();
  insert into public.hospedaje_avisos (canal, para, asunto, cuerpo, intentos)
  values ('whatsapp', 'whatsapp', 'Prueba de WhatsApp', 'Prueba de La Joya: si lees esto, los avisos por WhatsApp ya funcionan.', 4)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end
$$;

create or replace function public.hosp_estado_aviso(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j jsonb;
begin
  perform public.hosp_exigir_admin();
  select jsonb_build_object('estado', estado, 'detalle', detalle, 'canal', canal) into j
  from public.hospedaje_avisos where id = p_id;
  return j;
end
$$;

revoke all on function public.hosp_probar_whatsapp() from public, anon, authenticated;
revoke all on function public.hosp_estado_aviso(bigint) from public, anon, authenticated;
grant execute on function public.hosp_probar_whatsapp() to authenticated;
grant execute on function public.hosp_estado_aviso(bigint) to authenticated;

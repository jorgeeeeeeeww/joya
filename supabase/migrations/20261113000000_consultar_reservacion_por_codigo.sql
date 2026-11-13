-- Consulta segura desde «Ver reservación»: el código LJ es corto y se confirma también con el teléfono del huésped.
create or replace function public.consultar_reservacion_codigo(p_codigo text, p_telefono text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_telefono text := regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g');
  v_token uuid;
begin
  if v_codigo !~ '^LJ[A-Z0-9]{4}$' or v_telefono !~ '^[0-9]{10,13}$' then
    return public.hosp_error('no_existe', 'No encontramos una reservación con esos datos. Revisa el código y el WhatsApp usado al reservar.');
  end if;

  perform public.vencer_solicitudes();
  select r.token into v_token
  from public.reservaciones r
  where r.codigo = 'LJ-' || substr(v_codigo, 3)
    and right(coalesce(r.telefono, ''), 10) = right(v_telefono, 10);

  if v_token is null then
    return public.hosp_error('no_existe', 'No encontramos una reservación con esos datos. Revisa el código y el WhatsApp usado al reservar.');
  end if;

  return public.consultar_reservacion(v_token) || jsonb_build_object('token', v_token);
end
$$;

revoke all on function public.consultar_reservacion_codigo(text, text) from public, anon, authenticated;
grant execute on function public.consultar_reservacion_codigo(text, text) to anon, authenticated;

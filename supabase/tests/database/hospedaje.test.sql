-- Pruebas automáticas de hospedaje: la web solo ve lo público, nadie empalma fechas y solo el
-- equipo de hospedaje ve las reservaciones.
-- Se corren con:   npx supabase test db   (también en GitHub Actions antes de publicar)
-- En la computadora, sin Docker:   cd mac && npm run probar:base
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('00000000-0000-0000-0000-0000000000f1', 'dueno-hospedaje@prueba.mx', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'limpieza-hospedaje@prueba.mx', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into public.profiles (id, role, employee_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'admin', 'e_dueno'),
  ('00000000-0000-0000-0000-0000000000f2', 'limpieza', 'e_limpieza');

update public.hospedaje_ajustes set reservas_web = true, anticipo_pct = 50 where id;
insert into public.cabanas (id, slug, nombre, capacidad, precio_noche, publicada)
values ('00000000-0000-0000-0000-0000000000c1', 'cabana-pgtap', 'Cabaña de prueba', 4, 1000, true);
insert into public.cabanas (id, slug, nombre, capacidad, precio_noche, publicada)
values ('00000000-0000-0000-0000-0000000000c2', 'cabana-oculta-pgtap', 'Cabaña sin publicar', 2, 800, false);

create temp table fechas as select public.hosp_hoy() + 10 as llegada, public.hosp_hoy() + 12 as salida;
grant select on fechas to anon, authenticated, service_role;

create or replace function pg_temp.como(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end
$$;

-- ── La web, sin cuenta ──
set local role anon;
select throws_ok($$ select count(*) from public.reservaciones $$, '42501', null, 'Sin sesión no se leen las reservaciones');
select throws_ok($$ select count(*) from public.cabanas $$, '42501', null, 'Sin sesión no se lee la tabla de cabañas');
select is(jsonb_array_length(public.cabanas_publicas()), 1, 'La web solo ve la cabaña publicada');
select is((select (public.cotizar('cabana-pgtap', llegada, salida, 2) ->> 'total')::numeric from fechas), 2000::numeric, 'La web cotiza con el precio del rancho');
select throws_ok($$ select public.solicitar_reservacion('{}'::jsonb) $$, '42501', null, 'La web no puede saltarse la función reservar');
select throws_ok($$ select public.hosp_datos() $$, '42501', null, 'La web no ve los datos del dueño');
reset role;

-- ── La función reservar (llave secreta) ──
set local role service_role;
select ok((select (public.solicitar_reservacion(jsonb_build_object(
  'cabana', 'cabana-pgtap', 'llegada', llegada, 'salida', salida, 'huespedes', 2,
  'nombre', 'Huésped de Prueba', 'telefono', '3312345678', 'acepto', true, 'ip', '203.0.113.7')) ->> 'ok')::boolean from fechas),
  'La función reservar crea la solicitud');
select is((select public.solicitar_reservacion(jsonb_build_object(
  'cabana', 'cabana-pgtap', 'llegada', llegada, 'salida', salida, 'huespedes', 2,
  'nombre', 'Otra Persona', 'telefono', '3399998888', 'acepto', true)) ->> 'motivo' from fechas),
  'no_disponible', 'Nadie más puede apartar las mismas fechas');
reset role;

create temp table datos_solicitud as select id, token from public.reservaciones where nombre = 'Huésped de Prueba';
grant select on datos_solicitud to anon, authenticated, service_role;

-- ── La tabla misma impide empalmes (aunque alguien escriba directo) ──
select throws_ok($$ insert into public.reservaciones (codigo, cabana_id, llegada, salida, huespedes, nombre, total, estado)
  select 'LJ-ZZZZ', '00000000-0000-0000-0000-0000000000c1', llegada, salida - 1, 1, 'Directo', 0, 'confirmada' from fechas $$,
  '23P01', null, 'Dos reservaciones activas no se pueden empalmar');
select throws_ok($$ insert into public.bloqueos (cabana_id, inicio, fin)
  select '00000000-0000-0000-0000-0000000000c1', llegada, salida from fechas $$,
  '23P01', null, 'Un cierre no puede caer sobre una reservación');

-- ── Puestos ──
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select throws_ok($$ select public.hosp_datos() $$, '42501', null, 'Limpieza no ve las reservaciones');
reset role;

select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select is(jsonb_array_length(public.hosp_datos() -> 'reservaciones'), 1, 'El dueño ve la solicitud');
select is((select public.hosp_cambiar_estado(id, 'confirmada') ->> 'estado' from datos_solicitud), 'confirmada', 'El dueño confirma la solicitud');
select is((select public.hosp_registrar_pago(jsonb_build_object('reservacion_id', id, 'monto', 2000, 'metodo', 'transferencia')) ->> 'estado' from datos_solicitud), 'pagada', 'Al cubrir el total queda pagada');
select throws_ok($$ select public.hosp_guardar_cabana('{"slug": "cabana-pgtap", "nombre": "Repetida", "capacidad": 2}'::jsonb) $$, '23505', null, 'No se repite la dirección de una cabaña');
select is(public.hosp_guardar_cabana('{"slug": "habitacion-pgtap", "nombre": "Habitación de prueba", "tipo": "habitacion", "capacidad": 2}'::jsonb) ->> 'tipo', 'habitacion', 'El dueño da de alta una habitación de hotel');
select throws_ok($$ select public.hosp_guardar_cabana('{"slug": "otro-pgtap", "nombre": "Otro", "tipo": "hotel", "capacidad": 2}'::jsonb) $$, '23514', null, 'Solo hay cabaña, casa y habitación');
reset role;

-- ── Mi reservación (liga privada) ──
set local role anon;
select is((select public.consultar_reservacion(token) ->> 'estado' from datos_solicitud), 'pagada', 'El huésped ve su reservación con su liga');
select is((select public.cancelar_mi_reservacion(token) ->> 'motivo' from datos_solicitud), 'no_se_puede', 'Una reservación pagada no se cancela desde la web');
select is(public.consultar_reservacion('00000000-0000-0000-0000-000000000000') ->> 'motivo', 'no_existe', 'Una liga inventada no muestra nada');
reset role;

-- ── Tiempo real ──
-- Por renglón, no por instrucción: leer los datos corre un UPDATE que casi nunca toca nada,
-- y si eso avisara «hubo cambios», la app se quedaría recargando sin parar.
select is((select count(*)::integer from pg_catalog.pg_trigger where tgname like '%\_cambio' and not tgisinternal and (tgtype & 1) = 0), 0, 'Solo se avisa si de verdad cambió un renglón');

select * from finish();
rollback;

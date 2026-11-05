-- Pruebas automáticas: cada puesto solo ve y edita lo suyo.
-- Se corren con:   npx supabase test db   (también en GitHub Actions antes de publicar)
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Cuentas de prueba, una por puesto
insert into auth.users (id, email, instance_id, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'admin@prueba.mx', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'eventos@prueba.mx', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'recepcion@prueba.mx', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'limpieza@prueba.mx', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000e', 'sinpuesto@prueba.mx', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into public.profiles (id, role, employee_id) values
  ('00000000-0000-0000-0000-00000000000a', 'admin', 'e_admin'),
  ('00000000-0000-0000-0000-00000000000b', 'eventos', 'e_lupita'),
  ('00000000-0000-0000-0000-00000000000c', 'recepcion', 'e_ana'),
  ('00000000-0000-0000-0000-00000000000d', 'limpieza', 'e_maria');

-- Datos de muestra (como dueño de la base, sin reglas)
insert into public.documents (collection, id, data) values
  ('payments', 'pay_1', '{"id":"pay_1","amount":1000,"updatedAt":"2026-11-01T00:00:00.000Z"}'),
  ('events', 'evt_1', '{"id":"evt_1","name":"Boda","updatedAt":"2026-11-01T00:00:00.000Z"}'),
  ('tasks', 'tsk_1', '{"id":"tsk_1","title":"Limpiar cabaña","updatedAt":"2026-11-01T00:00:00.000Z"}'),
  ('leads', 'lea_1', '{"id":"lea_1","name":"Prospecto","updatedAt":"2026-11-01T00:00:00.000Z"}');

create or replace function pg_temp.como(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end
$$;

-- ── Sin sesión (anon): nada ──
set local role anon;
select throws_ok($$ select count(*) from public.documents $$, '42501', null, 'Sin sesión no se puede leer la tabla de datos');
select throws_ok($$ select public.my_role() $$, '42501', null, 'Sin sesión no se puede llamar a las funciones de rol');
reset role;

-- ── Limpieza ──
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.documents where collection = 'tasks'), 1, 'Limpieza ve las tareas');
select is((select count(*)::int from public.documents where collection = 'payments'), 0, 'Limpieza NO ve los pagos');
select is((select count(*)::int from public.documents where collection = 'events'), 0, 'Limpieza NO ve los eventos');
select lives_ok($$ insert into public.documents (collection, id, data) values ('tasks', 'tsk_2', '{"id":"tsk_2","updatedAt":"2026-11-02T00:00:00.000Z"}') $$, 'Limpieza puede crear tareas');
select throws_ok($$ insert into public.documents (collection, id, data) values ('payments', 'pay_x', '{"id":"pay_x"}') $$, '42501', null, 'Limpieza NO puede crear pagos');
select is((select count(*)::int from public.documents_history), 0, 'Limpieza NO ve el historial');
select is((select count(*)::int from public.client_errors), 0, 'Limpieza NO ve los errores de otros');
select lives_ok($$ insert into public.client_errors (device_id, source, message) values ('dev_l', 'pantalla', 'Algo falló 123') $$, 'Limpieza puede reportar sus errores');
reset role;

-- ── Recepción ──
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.documents where collection = 'payments'), 1, 'Recepción ve los pagos');
select is((select count(*)::int from public.documents where collection = 'events'), 0, 'Recepción NO ve los eventos');
select throws_ok($$ insert into public.documents (collection, id, data) values ('events', 'evt_x', '{"id":"evt_x"}') $$, '42501', null, 'Recepción NO puede crear eventos');
reset role;

-- ── Eventos ──
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.documents where collection = 'events'), 1, 'Eventos ve los eventos');
select is((select count(*)::int from public.documents where collection = 'leads'), 0, 'Eventos NO ve los prospectos (solo admin)');
select throws_ok($$ insert into public.documents (collection, id, data) values ('employees', 'e_x', '{"id":"e_x"}') $$, '42501', null, 'Eventos NO puede crear personas');
reset role;

-- ── Cuenta sin puesto ──
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from public.documents), 0, 'Una cuenta sin puesto no ve nada');
select throws_ok($$ insert into public.documents (collection, id, data) values ('tasks', 'tsk_x', '{"id":"tsk_x"}') $$, '42501', null, 'Una cuenta sin puesto no puede escribir');
reset role;

-- ── Avisos push: el puesto lo pone el servidor ──
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
insert into public.push_subscriptions (endpoint, subscription, role) values ('https://push.prueba/1', '{}', 'admin');
reset role;
select is((select role from public.push_subscriptions where endpoint = 'https://push.prueba/1'), 'limpieza', 'El rol de la suscripción sale de la cuenta, no del celular');

-- ── Dueño ──
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.documents where collection in ('payments','events','tasks','leads')), 5, 'El dueño ve todo');
select is((select count(*)::int from public.client_errors), 1, 'El dueño ve los errores de todos');
select is((select fingerprint from public.client_errors limit 1), md5('pantalla:algo falló #'), 'Los errores se agrupan sin los números');
select lives_ok($$ update public.app_config set value = '202611040000' where key = 'min_build' $$, 'El dueño puede cambiar la versión mínima');
reset role;

-- ── Funciones internas fuera de la API ──
select ok(not has_function_privilege('authenticated', 'public.monitor_check()', 'execute'), 'Nadie del equipo puede correr el monitor a mano');

select * from finish();
rollback;

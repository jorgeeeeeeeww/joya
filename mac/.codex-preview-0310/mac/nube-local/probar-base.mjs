// Corre supabase/tests/database/hospedaje.test.sql en la computadora (PGlite, sin Docker).
// En GitHub lo corre pgTAP de verdad (supabase test db); aquí se imitan las pocas funciones de pgTAP que usa.
//
//   npm run probar:base
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')

const TAP = `
create table public.__tap (n integer generated always as identity, ok boolean, descripcion text, detalle text);
create function public.__tap_registrar(p_ok boolean, p_descripcion text, p_detalle text) returns text
  language sql security definer set search_path = '' as $$
  insert into public.__tap (ok, descripcion, detalle) values (p_ok, p_descripcion, p_detalle);
  select case when p_ok then 'ok' else 'not ok' end;
$$;
create function public.plan(integer) returns text language sql as $$ select '1..' || $1 $$;
create function public.ok(boolean, text) returns text language sql as $$ select public.__tap_registrar(coalesce($1, false), $2, case when $1 is null then 'nulo' end) $$;
create function public."is"(anyelement, anyelement, text) returns text language sql as $$
  select public.__tap_registrar($1 is not distinct from $2, $3, format('se esperaba %s y salió %s', $2, $1))
$$;
create function public.throws_ok(text, text, text, text) returns text language plpgsql as $$
begin
  begin
    execute $1;
  exception when others then
    if $2 is null or sqlstate = $2 then
      return public.__tap_registrar(true, $4, null);
    end if;
    return public.__tap_registrar(false, $4, format('lanzó %s (%s) y se esperaba %s', sqlstate, sqlerrm, $2));
  end;
  return public.__tap_registrar(false, $4, 'no lanzó ningún error');
end
$$;
create function public.lives_ok(text, text) returns text language plpgsql as $$
begin
  execute $1;
  return public.__tap_registrar(true, $2, null);
exception when others then
  return public.__tap_registrar(false, $2, sqlerrm);
end
$$;
create function public.finish() returns setof text language sql as $$ select 'fin' $$;
grant execute on function public.__tap_registrar(boolean, text, text), public.plan(integer), public.ok(boolean, text),
  public."is"(anyelement, anyelement, text), public.throws_ok(text, text, text, text), public.lives_ok(text, text), public.finish()
  to anon, authenticated, service_role;
`

const pg = new PGlite({ extensions: { btree_gist } })
await pg.exec(await readFile(join(AQUI, 'supabase-local.sql'), 'utf8'))
await pg.exec(await readFile(join(RAIZ, 'supabase', 'migrations', '20261105000000_hospedaje.sql'), 'utf8'))
await pg.exec(await readFile(join(RAIZ, 'supabase', 'migrations', '20261112000000_avisos_al_celular.sql'), 'utf8'))
await pg.exec(TAP)

let prueba = await readFile(join(RAIZ, 'supabase', 'tests', 'database', 'hospedaje.test.sql'), 'utf8')
const planeadas = Number(prueba.match(/select plan\((\d+)\)/)?.[1] ?? 0)
prueba = prueba
  .replace(/create extension if not exists pgtap[^;]*;/, '')
  .replace(/\brollback;\s*$/, 'commit;')
try {
  await pg.exec(prueba)
} catch (e) {
  console.error(`La prueba no pudo correr: ${e.message}`)
  process.exit(1)
}
const { rows } = await pg.query('select ok, descripcion, detalle from public.__tap order by n')
for (const r of rows) console.log(`  ${r.ok ? '✓' : '✗'} ${r.descripcion}${r.ok ? '' : `\n      ${r.detalle}`}`)
const malas = rows.filter((r) => !r.ok).length
const completas = rows.length === planeadas
console.log(`\n${rows.length - malas} de ${rows.length} bien${malas ? ` · ${malas} fallaron` : ''}${completas ? '' : ` · el plan decía ${planeadas}`}`)
process.exit(malas || !completas ? 1 : 0)

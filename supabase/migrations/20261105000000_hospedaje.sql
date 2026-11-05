-- ════════════════════════════════════════════════════════════════════
-- Hospedaje con reservaciones directas (noviembre 2026)
--
-- La web pública (carpeta web/) y la app de la Mac (carpeta mac/) usan esta misma base.
--  · La web, sin cuenta, solo llama funciones: ver cabañas publicadas, fechas ocupadas, cotizar,
--    consultar y cancelar su propia solicitud. Crear una solicitud pasa por la función reservar
--    (anti-robots de Cloudflare), que llama a solicitar_reservacion con la llave secreta.
--  · El dueño (puesto admin o recepción) usa las funciones hosp_* desde la app de la Mac.
--  · Las tablas están cerradas para todos: solo se tocan a través de estas funciones.
--  · Dos reservaciones activas de la misma cabaña nunca se empalman: lo impide la propia tabla
--    (restricción de exclusión), aunque dos personas reserven al mismo segundo.
--
-- El contrato completo para la web está en docs/HOSPEDAJE-WEB.md.
-- Se puede aplicar varias veces sin romper nada.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ── Quién es del equipo de hospedaje ─────────────────────────────────
create or replace function public.hosp_es_equipo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.role in ('admin', 'recepcion') from public.profiles p where p.id = (select auth.uid())), false)
$$;

create or replace function public.hosp_es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.id = (select auth.uid())), false)
$$;

create or replace function public.hosp_exigir_equipo()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.hosp_es_equipo() then
    raise exception 'Solo el equipo de hospedaje puede hacer esto' using errcode = '42501';
  end if;
end
$$;

create or replace function public.hosp_exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.hosp_es_admin() then
    raise exception 'Solo el dueño puede cambiar esto' using errcode = '42501';
  end if;
end
$$;

-- ── Ayudas de texto (fechas y dinero en español, hora de Jalisco) ────
create or replace function public.hosp_hoy()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Mexico_City')::date
$$;

create or replace function public.hosp_fecha(d date)
returns text
language sql
immutable
set search_path = ''
as $$
  select extract(day from d)::int || ' ' || (array['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'])[extract(month from d)::int]
$$;

-- «12 – 14 dic» o «30 dic – 2 ene»
create or replace function public.hosp_rango(a date, b date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when date_trunc('month', a) = date_trunc('month', b) then extract(day from a)::int || ' – ' || public.hosp_fecha(b)
    else public.hosp_fecha(a) || ' – ' || public.hosp_fecha(b)
  end
$$;

create or replace function public.hosp_dinero(n numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select '$' || to_char(round(coalesce(n, 0)), 'FM999,999,990')
$$;

-- «5 nov a las 14:30» (hora de Jalisco)
create or replace function public.hosp_momento(t timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select public.hosp_fecha((t at time zone 'America/Mexico_City')::date) || ' a las ' || to_char(t at time zone 'America/Mexico_City', 'HH24:MI')
$$;

create or replace function public.hosp_error(p_motivo text, p_mensaje text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('ok', false, 'motivo', p_motivo, 'mensaje', p_mensaje)
$$;

-- ── Tablas ───────────────────────────────────────────────────────────

-- Ajustes del hospedaje (una sola fila). Todo lo decide el rancho desde la app.
create table if not exists public.hospedaje_ajustes (
  id boolean primary key default true check (id),
  reservas_web boolean not null default false,          -- la web recibe solicitudes (apagado hasta que el rancho lo prenda)
  telefono_salon text check (char_length(telefono_salon) <= 30),
  telefono_hospedaje text check (char_length(telefono_hospedaje) <= 30), -- WhatsApp de reservaciones
  correo_avisos text check (char_length(correo_avisos) <= 160),          -- adónde llegan los avisos al dueño
  url_web text check (char_length(url_web) <= 200),                      -- dirección de la web, para la liga «Mi reservación»
  hora_llegada text check (hora_llegada ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  hora_salida text check (hora_salida ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  anticipo_pct numeric(5, 2) not null default 0 check (anticipo_pct between 0 and 100),
  horas_apartado integer not null default 24 check (horas_apartado between 1 and 720),
  noches_minimas integer not null default 1 check (noches_minimas between 1 and 60),
  noches_fin_semana smallint[] not null default '{5,6}', -- noches que cobran tarifa de fin de semana (1 = lunes … 7 = domingo)
  dias_anticipacion integer not null default 365 check (dias_anticipacion between 7 and 730),
  banco text check (char_length(banco) <= 60),
  clabe text check (clabe ~ '^[0-9]{18}$'),
  titular text check (char_length(titular) <= 120),
  politicas text check (char_length(politicas) <= 6000),
  aviso_privacidad text check (char_length(aviso_privacidad) <= 20000),
  actualizado timestamptz not null default now()
);
insert into public.hospedaje_ajustes (id) values (true) on conflict (id) do nothing;

-- Hospedajes: cabañas, casas amuebladas y habitaciones de hotel (la tabla se llama «cabanas» por historia).
-- No hay datos de ejemplo: el rancho captura nombres, fotos y precios.
create table if not exists public.cabanas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  nombre text not null check (char_length(nombre) between 1 and 80),
  tipo text not null default 'cabana' constraint cabanas_tipo_check check (tipo in ('cabana', 'casa', 'habitacion')),
  resumen text check (char_length(resumen) <= 200),
  descripcion text check (char_length(descripcion) <= 4000),
  capacidad integer not null check (capacidad between 1 and 50),
  recamaras integer check (recamaras between 0 and 20),
  camas text check (char_length(camas) <= 200),
  banos numeric(3, 1) check (banos between 0 and 20),
  amenidades text[] not null default '{}',
  fotos jsonb not null default '[]'::jsonb check (jsonb_typeof(fotos) = 'array'), -- [{ruta, ancho, alto, alt}]
  precio_noche numeric(10, 2) check (precio_noche > 0),
  precio_fin_semana numeric(10, 2) check (precio_fin_semana > 0),
  huespedes_incluidos integer check (huespedes_incluidos >= 1),
  precio_huesped_extra numeric(10, 2) check (precio_huesped_extra >= 0),
  noches_minimas integer check (noches_minimas between 1 and 60),
  publicada boolean not null default false,
  orden integer not null default 0,
  notas text check (char_length(notas) <= 2000), -- internas, nunca salen en la web
  creada timestamptz not null default now(),
  actualizada timestamptz not null default now()
);
-- Si la tabla ya existía con solo cabaña y casa, se le agrega «habitacion» (habitación de hotel)
alter table public.cabanas drop constraint if exists cabanas_tipo_check;
alter table public.cabanas add constraint cabanas_tipo_check check (tipo in ('cabana', 'casa', 'habitacion'));

-- Temporadas: precio especial por noche en un rango (Semana Santa, diciembre…). Noches de «desde» a «hasta», inclusive.
create table if not exists public.temporadas (
  id uuid primary key default gen_random_uuid(),
  cabana_id uuid not null references public.cabanas (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 60),
  desde date not null,
  hasta date not null,
  precio_noche numeric(10, 2) not null check (precio_noche > 0),
  noches_minimas integer check (noches_minimas between 1 and 60),
  creada timestamptz not null default now(),
  constraint temporadas_fechas check (hasta >= desde),
  constraint temporadas_sin_empalme exclude using gist (cabana_id with =, daterange(desde, hasta, '[]') with &&)
);

-- Cierres: fechas en que la cabaña no se renta (mantenimiento, uso propio, un evento en el salón).
-- Igual que una reservación: «inicio» es la primera noche cerrada y «fin» el día en que vuelve a estar libre.
create table if not exists public.bloqueos (
  id uuid primary key default gen_random_uuid(),
  cabana_id uuid not null references public.cabanas (id) on delete cascade,
  inicio date not null,
  fin date not null,
  motivo text check (char_length(motivo) <= 120),
  creado timestamptz not null default now(),
  creado_por uuid default auth.uid(),
  constraint bloqueos_fechas check (fin > inicio),
  constraint bloqueos_sin_empalme exclude using gist (cabana_id with =, daterange(inicio, fin, '[)') with &&)
);

-- Reservaciones. «llegada» es la primera noche y «salida» el día en que se van (esa noche queda libre).
create table if not exists public.reservaciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,                         -- LJ-7K2Q: lo que el huésped dicta por teléfono y usa como referencia de pago
  token uuid not null unique default gen_random_uuid(), -- liga privada del huésped («Mi reservación»)
  cabana_id uuid not null references public.cabanas (id) on delete restrict,
  llegada date not null,
  salida date not null,
  huespedes integer not null check (huespedes between 1 and 50),
  nombre text not null check (char_length(nombre) between 2 and 120),
  telefono text check (telefono ~ '^[0-9]{10,13}$'),
  correo text check (char_length(correo) <= 160),
  hora_llegada text check (char_length(hora_llegada) <= 20),
  comentarios text check (char_length(comentarios) <= 1000),
  origen text not null default 'web' check (origen in ('web', 'telefono', 'whatsapp', 'directo')),
  estado text not null default 'solicitud' check (estado in ('solicitud', 'confirmada', 'pagada', 'cancelada')),
  total numeric(10, 2) not null check (total >= 0),
  anticipo numeric(10, 2) not null default 0 check (anticipo >= 0),
  desglose jsonb not null default '[]'::jsonb,          -- precio noche por noche al momento de reservar
  vence timestamptz,                                    -- hasta cuándo se apartan las fechas de una solicitud
  motivo_cancelacion text check (motivo_cancelacion in ('huesped', 'rancho', 'vencida')),
  notas text check (char_length(notas) <= 2000),        -- internas del rancho
  acepto_politicas timestamptz,
  creada timestamptz not null default now(),
  confirmada_en timestamptz,
  pagada_en timestamptz,
  cancelada_en timestamptz,
  actualizada timestamptz not null default now(),
  constraint reservaciones_fechas check (salida > llegada),
  constraint reservaciones_sin_empalme exclude using gist (cabana_id with =, daterange(llegada, salida, '[)') with &&) where (estado <> 'cancelada')
);
create index if not exists reservaciones_llegada_idx on public.reservaciones (llegada);
create index if not exists reservaciones_solicitudes_idx on public.reservaciones (vence) where estado = 'solicitud';
create index if not exists reservaciones_telefono_idx on public.reservaciones (telefono);

create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  reservacion_id uuid not null references public.reservaciones (id) on delete cascade,
  monto numeric(10, 2) not null check (monto > 0),
  metodo text not null check (metodo in ('transferencia', 'efectivo', 'tarjeta', 'mercadopago', 'otro')),
  fecha date not null default (now() at time zone 'America/Mexico_City')::date,
  referencia text check (char_length(referencia) <= 120),
  creado timestamptz not null default now(),
  creado_por uuid default auth.uid()
);
create index if not exists pagos_reservacion_idx on public.pagos (reservacion_id);

-- Historia de cada reservación (lo escriben los disparadores, nadie a mano)
create table if not exists public.reservacion_eventos (
  id bigint generated always as identity primary key,
  reservacion_id uuid not null references public.reservaciones (id) on delete cascade,
  creado timestamptz not null default now(),
  tipo text not null,
  detalle text not null,
  por uuid default auth.uid()
);
create index if not exists reservacion_eventos_idx on public.reservacion_eventos (reservacion_id, creado);

-- Correos por mandar (los envía la función avisos-hospedaje con Resend)
create table if not exists public.hospedaje_avisos (
  id bigint generated always as identity primary key,
  reservacion_id uuid references public.reservaciones (id) on delete set null,
  para text not null,
  asunto text not null,
  cuerpo text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'enviado', 'error', 'sin_configurar')),
  intentos integer not null default 0,
  detalle text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists hospedaje_avisos_pendientes_idx on public.hospedaje_avisos (creado) where estado in ('pendiente', 'enviando');

-- Solicitudes por dirección de internet (solo una huella, nunca la dirección), para frenar abusos
create table if not exists public.hospedaje_intentos (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  creado timestamptz not null default now()
);
create index if not exists hospedaje_intentos_idx on public.hospedaje_intentos (ip_hash, creado);

-- Nadie toca las tablas directo: todo pasa por las funciones de abajo
alter table public.hospedaje_ajustes enable row level security;
alter table public.cabanas enable row level security;
alter table public.temporadas enable row level security;
alter table public.bloqueos enable row level security;
alter table public.reservaciones enable row level security;
alter table public.pagos enable row level security;
alter table public.reservacion_eventos enable row level security;
alter table public.hospedaje_avisos enable row level security;
alter table public.hospedaje_intentos enable row level security;
revoke all on table public.hospedaje_ajustes, public.cabanas, public.temporadas, public.bloqueos, public.reservaciones,
  public.pagos, public.reservacion_eventos, public.hospedaje_avisos, public.hospedaje_intentos from anon, authenticated;

-- ── Reglas de ocupación y precio ─────────────────────────────────────

-- Una solicitud vencida ya no aparta fechas (aunque el barrido no haya pasado todavía)
create or replace function public.hosp_ocupada(p_cabana uuid, p_llegada date, p_salida date, p_ignorar uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reservaciones r
    where r.cabana_id = p_cabana
      and r.estado <> 'cancelada'
      and not (r.estado = 'solicitud' and coalesce(r.vence, 'infinity'::timestamptz) < now())
      and (p_ignorar is null or r.id <> p_ignorar)
      and daterange(r.llegada, r.salida) && daterange(p_llegada, p_salida)
  ) or exists (
    select 1 from public.bloqueos b
    where b.cabana_id = p_cabana and daterange(b.inicio, b.fin) && daterange(p_llegada, p_salida)
  )
$$;

-- Precio noche por noche: temporada > fin de semana > precio normal. Nunca inventa un precio.
create or replace function public.hosp_precio(p_cabana uuid, p_llegada date, p_salida date, p_huespedes integer, p_ignorar uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.cabanas;
  aj public.hospedaje_ajustes;
  t public.temporadas;
  d date;
  noches integer;
  precio numeric;
  tipo text;
  temporada text;
  desglose jsonb := '[]'::jsonb;
  subtotal numeric := 0;
  extra numeric := 0;
  minimo integer;
  total numeric;
begin
  select * into c from public.cabanas where id = p_cabana;
  if not found then
    return public.hosp_error('no_existe', 'No encontramos esa cabaña.');
  end if;
  select * into aj from public.hospedaje_ajustes where id;
  if p_llegada is null or p_salida is null or p_salida <= p_llegada then
    return public.hosp_error('fechas_invalidas', 'La salida debe ser después de la llegada.');
  end if;
  noches := p_salida - p_llegada;
  if noches > 60 then
    return public.hosp_error('muy_largo', 'Una estancia puede ser de hasta 60 noches.');
  end if;
  if p_huespedes is null or p_huespedes < 1 then
    return public.hosp_error('huespedes', 'Indica cuántas personas se hospedan.');
  end if;
  if p_huespedes > c.capacidad then
    return public.hosp_error('capacidad', format('Esta cabaña es para máximo %s %s.', c.capacidad, case when c.capacidad = 1 then 'persona' else 'personas' end));
  end if;

  minimo := coalesce(c.noches_minimas, aj.noches_minimas, 1);
  d := p_llegada;
  while d < p_salida loop
    temporada := null;
    select * into t from public.temporadas x where x.cabana_id = c.id and d between x.desde and x.hasta order by x.hasta - x.desde, x.creada desc limit 1;
    if found then
      precio := t.precio_noche;
      tipo := 'temporada';
      temporada := t.nombre;
      minimo := greatest(minimo, coalesce(t.noches_minimas, 0));
    elsif extract(isodow from d)::smallint = any (aj.noches_fin_semana) and c.precio_fin_semana is not null then
      precio := c.precio_fin_semana;
      tipo := 'fin_semana';
    else
      precio := c.precio_noche;
      tipo := 'normal';
    end if;
    if precio is null then
      return public.hosp_error('sin_precio', 'Esta cabaña todavía no tiene precio para esas fechas.');
    end if;
    desglose := desglose || jsonb_build_object('fecha', d, 'precio', precio, 'tipo', tipo, 'temporada', temporada);
    subtotal := subtotal + precio;
    d := d + 1;
  end loop;

  if c.huespedes_incluidos is not null and c.precio_huesped_extra is not null and p_huespedes > c.huespedes_incluidos then
    extra := (p_huespedes - c.huespedes_incluidos) * c.precio_huesped_extra * noches;
  end if;
  total := subtotal + extra;

  return jsonb_build_object(
    'ok', true,
    'noches', noches,
    'desglose', desglose,
    'subtotal', subtotal,
    'extra', extra,
    'total', total,
    'anticipo', round(total * aj.anticipo_pct / 100),
    'minimo_noches', minimo,
    'cumple_minimo', noches >= minimo,
    'disponible', not public.hosp_ocupada(c.id, p_llegada, p_salida, p_ignorar)
  );
end
$$;

create or replace function public.hosp_nuevo_codigo()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- sin 0/O, 1/I/L: se dicta sin confusiones
  c text;
begin
  loop
    c := 'LJ-';
    for i in 1..4 loop
      c := c || substr(letras, 1 + floor(random() * length(letras))::int, 1);
    end loop;
    exit when not exists (select 1 from public.reservaciones where codigo = c);
  end loop;
  return c;
end
$$;

create or replace function public.hosp_datos_pago(p_codigo text, p_monto numeric)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when a.clabe is null then null else jsonb_build_object(
    'banco', a.banco, 'clabe', a.clabe, 'titular', a.titular, 'referencia', p_codigo, 'monto', p_monto
  ) end
  from public.hospedaje_ajustes a where a.id
$$;

create or replace function public.hosp_liga(p_token uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when a.url_web is null then null else rtrim(a.url_web, '/') || '/mi-reservacion?t=' || p_token end
  from public.hospedaje_ajustes a where a.id
$$;

-- Barrido: las solicitudes que vencieron sin confirmarse liberan sus fechas
create or replace function public.vencer_solicitudes()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  with v as (
    update public.reservaciones set estado = 'cancelada', motivo_cancelacion = 'vencida'
    where estado = 'solicitud' and vence < now()
    returning 1
  )
  select count(*) into n from v;
  delete from public.hospedaje_intentos where creado < now() - interval '2 days';
  return n;
end
$$;

-- ── Disparadores: horas, historia, pagos y avisos ────────────────────

-- Evita que un cierre caiga sobre una reservación (y al revés). El candado por cabaña
-- ordena a quienes escriben al mismo tiempo.
create or replace function public.hosp_revisar_empalme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a date;
  b date;
begin
  if tg_table_name = 'reservaciones' then
    if new.estado = 'cancelada' then
      return new;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('hospedaje:' || new.cabana_id::text, 0));
    select x.inicio, x.fin into a, b from public.bloqueos x
    where x.cabana_id = new.cabana_id and daterange(x.inicio, x.fin) && daterange(new.llegada, new.salida) limit 1;
    if found then
      raise exception 'La cabaña está cerrada del % al %', public.hosp_fecha(a), public.hosp_fecha(b) using errcode = '23P01';
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('hospedaje:' || new.cabana_id::text, 0));
    select x.llegada, x.salida into a, b from public.reservaciones x
    where x.cabana_id = new.cabana_id and x.estado <> 'cancelada'
      and daterange(x.llegada, x.salida) && daterange(new.inicio, new.fin) limit 1;
    if found then
      raise exception 'Hay una reservación del % al %', public.hosp_fecha(a), public.hosp_fecha(b) using errcode = '23P01';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists reservaciones_empalme on public.reservaciones;
create trigger reservaciones_empalme before insert or update of cabana_id, llegada, salida, estado on public.reservaciones
  for each row execute function public.hosp_revisar_empalme();
drop trigger if exists bloqueos_empalme on public.bloqueos;
create trigger bloqueos_empalme before insert or update on public.bloqueos
  for each row execute function public.hosp_revisar_empalme();

create or replace function public.hosp_reservacion_antes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizada := now();
  if tg_op = 'INSERT' then
    if new.estado in ('confirmada', 'pagada') then
      new.confirmada_en := coalesce(new.confirmada_en, now());
    end if;
    return new;
  end if;
  if new.estado is distinct from old.estado then
    if new.estado in ('confirmada', 'pagada') then
      new.confirmada_en := coalesce(new.confirmada_en, now());
    end if;
    if new.estado = 'pagada' then
      new.pagada_en := now();
    end if;
    if new.estado = 'cancelada' then
      new.cancelada_en := now();
      new.motivo_cancelacion := coalesce(new.motivo_cancelacion, 'rancho');
    else
      new.cancelada_en := null;
      new.motivo_cancelacion := null;
    end if;
    if new.estado <> 'solicitud' then
      new.vence := null;
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists reservaciones_antes on public.reservaciones;
create trigger reservaciones_antes before insert or update on public.reservaciones
  for each row execute function public.hosp_reservacion_antes();

-- Con lo pagado se acomoda el estado: el primer pago confirma y cubrir el total la marca pagada
create or replace function public.hosp_reevaluar_pago(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reservaciones;
  pagado numeric;
begin
  select * into r from public.reservaciones where id = p_id;
  if not found or r.estado = 'cancelada' then
    return;
  end if;
  select coalesce(sum(monto), 0) into pagado from public.pagos where reservacion_id = p_id;
  if pagado > 0 and pagado >= r.total then
    if r.estado <> 'pagada' then
      update public.reservaciones set estado = 'pagada' where id = p_id;
    end if;
  elsif pagado > 0 and r.estado = 'solicitud' then
    update public.reservaciones set estado = 'confirmada' where id = p_id;
  elsif r.estado = 'pagada' and pagado < r.total then
    update public.reservaciones set estado = 'confirmada' where id = p_id;
  end if;
end
$$;

create or replace function public.hosp_correo_huesped(r public.reservaciones, p_tipo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cabanas;
  aj public.hospedaje_ajustes;
  liga text := public.hosp_liga(r.token);
  pago jsonb;
  noches integer := r.salida - r.llegada;
  cuerpo text;
  asunto text;
begin
  if r.correo is null then
    return;
  end if;
  select * into c from public.cabanas where id = r.cabana_id;
  select * into aj from public.hospedaje_ajustes where id;
  cuerpo := 'Hola ' || split_part(r.nombre, ' ', 1) || E',\n\n';
  if p_tipo = 'recibida' then
    asunto := 'Recibimos tu solicitud ' || r.codigo;
    cuerpo := cuerpo || format(E'Recibimos tu solicitud %s para %s, %s (%s %s, %s %s).\nTotal: %s.\n\n',
      r.codigo, c.nombre, public.hosp_rango(r.llegada, r.salida), noches, case when noches = 1 then 'noche' else 'noches' end,
      r.huespedes, case when r.huespedes = 1 then 'persona' else 'personas' end, public.hosp_dinero(r.total));
    pago := public.hosp_datos_pago(r.codigo, r.anticipo);
    if r.anticipo > 0 and pago is not null then
      cuerpo := cuerpo || format(E'Para apartar tus fechas, transfiere el anticipo de %s antes del %s:\nBanco: %s\nCLABE: %s\nA nombre de: %s\nReferencia: %s\n\n',
        public.hosp_dinero(r.anticipo), public.hosp_momento(r.vence), coalesce(pago ->> 'banco', ''), pago ->> 'clabe', coalesce(pago ->> 'titular', ''), r.codigo);
    else
      cuerpo := cuerpo || format(E'Te confirmamos por WhatsApp. Tus fechas quedan apartadas hasta el %s.\n\n', public.hosp_momento(r.vence));
    end if;
  elsif p_tipo = 'confirmada' then
    asunto := 'Tu reservación ' || r.codigo || ' está confirmada';
    cuerpo := cuerpo || format(E'Tu reservación %s en %s está confirmada: %s, %s %s.\n',
      r.codigo, c.nombre, public.hosp_rango(r.llegada, r.salida), r.huespedes, case when r.huespedes = 1 then 'persona' else 'personas' end);
    if aj.hora_llegada is not null then
      cuerpo := cuerpo || format(E'Llegada a partir de las %s', aj.hora_llegada) || coalesce(format(' · salida a las %s', aj.hora_salida), '') || E'.\n';
    end if;
    cuerpo := cuerpo || E'\n';
  elsif p_tipo = 'vencida' then
    asunto := 'Tu solicitud ' || r.codigo || ' venció';
    cuerpo := cuerpo || format(E'Tu solicitud %s para %s (%s) venció sin confirmarse y las fechas se liberaron. Si todavía quieres venir, haz una nueva solicitud o escríbenos.\n\n',
      r.codigo, c.nombre, public.hosp_rango(r.llegada, r.salida));
  else
    return;
  end if;
  if liga is not null and p_tipo <> 'vencida' then
    cuerpo := cuerpo || 'Consulta tu reservación: ' || liga || E'\n';
  end if;
  if aj.telefono_hospedaje is not null then
    cuerpo := cuerpo || 'WhatsApp: ' || aj.telefono_hospedaje || E'\n';
  end if;
  insert into public.hospedaje_avisos (reservacion_id, para, asunto, cuerpo) values (r.id, r.correo, asunto, cuerpo);
end
$$;

create or replace function public.hosp_reservacion_despues()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cab text;
  aj public.hospedaje_ajustes;
  noches integer := new.salida - new.llegada;
begin
  select nombre into cab from public.cabanas where id = new.cabana_id;
  select * into aj from public.hospedaje_ajustes where id;

  if tg_op = 'INSERT' then
    insert into public.reservacion_eventos (reservacion_id, tipo, detalle)
    values (new.id, 'creada', case new.origen
      when 'web' then 'Llegó de la página web'
      when 'telefono' then 'La capturó el rancho (llamada)'
      when 'whatsapp' then 'La capturó el rancho (WhatsApp)'
      else 'La capturó el rancho' end);
    if new.origen = 'web' then
      if aj.correo_avisos is not null then
        insert into public.hospedaje_avisos (reservacion_id, para, asunto, cuerpo)
        values (new.id, aj.correo_avisos,
          format('Nueva solicitud %s · %s · %s', new.codigo, cab, public.hosp_rango(new.llegada, new.salida)),
          format(E'%s pidió %s del %s (%s %s, %s %s).\nTotal: %s · anticipo: %s.\nWhatsApp: %s%s\nSe aparta hasta el %s.%s\n\nÁbrela en la app La Joya de la Mac.',
            new.nombre, cab, public.hosp_rango(new.llegada, new.salida), noches, case when noches = 1 then 'noche' else 'noches' end,
            new.huespedes, case when new.huespedes = 1 then 'persona' else 'personas' end,
            public.hosp_dinero(new.total), public.hosp_dinero(new.anticipo), coalesce(new.telefono, '—'),
            coalesce(' · ' || new.correo, ''), public.hosp_momento(new.vence),
            coalesce(E'\nComentarios: ' || new.comentarios, '')));
      end if;
      perform public.hosp_correo_huesped(new, 'recibida');
    end if;
    return null;
  end if;

  if new.estado is distinct from old.estado then
    insert into public.reservacion_eventos (reservacion_id, tipo, detalle)
    values (new.id, new.estado, case new.estado
      when 'confirmada' then case when old.estado = 'pagada' then 'Volvió a confirmada: falta saldo' else 'Confirmada' end
      when 'pagada' then 'Pagada por completo'
      when 'solicitud' then 'Volvió a solicitud'
      else case new.motivo_cancelacion
        when 'vencida' then 'Se canceló sola: venció el apartado'
        when 'huesped' then 'La canceló el huésped'
        else 'La canceló el rancho' end
      end);
    if old.estado = 'solicitud' and new.estado in ('confirmada', 'pagada') then
      perform public.hosp_correo_huesped(new, 'confirmada');
    elsif new.estado = 'cancelada' and new.motivo_cancelacion = 'vencida' then
      perform public.hosp_correo_huesped(new, 'vencida');
    end if;
  end if;
  if (new.llegada, new.salida, new.cabana_id) is distinct from (old.llegada, old.salida, old.cabana_id) then
    insert into public.reservacion_eventos (reservacion_id, tipo, detalle)
    values (new.id, 'movida', public.hosp_rango(old.llegada, old.salida) || ' → ' || public.hosp_rango(new.llegada, new.salida)
      || case when new.cabana_id <> old.cabana_id then ' · ahora en ' || cab else '' end);
  end if;
  if new.total is distinct from old.total then
    insert into public.reservacion_eventos (reservacion_id, tipo, detalle)
    values (new.id, 'total', 'Total ' || public.hosp_dinero(old.total) || ' → ' || public.hosp_dinero(new.total));
    perform public.hosp_reevaluar_pago(new.id);
  end if;
  return null;
end
$$;
drop trigger if exists reservaciones_despues on public.reservaciones;
create trigger reservaciones_despues after insert or update on public.reservaciones
  for each row execute function public.hosp_reservacion_despues();

create or replace function public.hosp_pago_despues()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.reservacion_eventos (reservacion_id, tipo, detalle)
    values (new.reservacion_id, 'pago', 'Pago de ' || public.hosp_dinero(new.monto) || ' · ' || new.metodo || coalesce(' · ' || new.referencia, ''));
    perform public.hosp_reevaluar_pago(new.reservacion_id);
  else
    if exists (select 1 from public.reservaciones where id = old.reservacion_id) then
      insert into public.reservacion_eventos (reservacion_id, tipo, detalle)
      values (old.reservacion_id, 'pago_borrado', 'Se quitó el pago de ' || public.hosp_dinero(old.monto));
      perform public.hosp_reevaluar_pago(old.reservacion_id);
    end if;
  end if;
  return null;
end
$$;
drop trigger if exists pagos_despues on public.pagos;
create trigger pagos_despues after insert or delete on public.pagos
  for each row execute function public.hosp_pago_despues();

-- Tiempo real: la base solo avisa «hubo cambios» en el canal privado «hospedaje» (sin datos);
-- la app de la Mac baja lo nuevo con su sesión. El disparador es por renglón y no por instrucción:
-- hosp_datos corre vencer_solicitudes(), un UPDATE que casi nunca toca nada, y si eso avisara,
-- cada lectura provocaría otra lectura y la app se quedaría recargando sin parar.
create or replace function public.hosp_avisar_cambio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('tabla', tg_table_name, 'at', clock_timestamp()), 'cambio', 'hospedaje', true);
  return null;
exception when others then
  return null; -- si el tiempo real falla, guardar nunca falla (la app también revisa cada 30 s)
end
$$;
do $$
declare
  t text;
begin
  foreach t in array array['hospedaje_ajustes', 'cabanas', 'temporadas', 'bloqueos', 'reservaciones', 'pagos'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_cambio', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.hosp_avisar_cambio()', t || '_cambio', t);
  end loop;
end
$$;

-- Correos nuevos: se le pide a la función avisos-hospedaje que los mande (sin esperar)
create or replace function public.hosp_mandar_avisos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.edge_post('avisos-hospedaje', '{}'::jsonb);
  return null;
exception when others then
  return null; -- el barrido de cada 10 minutos lo reintenta
end
$$;
drop trigger if exists hospedaje_avisos_mandar on public.hospedaje_avisos;
create trigger hospedaje_avisos_mandar after insert on public.hospedaje_avisos
  for each statement execute function public.hosp_mandar_avisos();

-- ── Funciones para la web (sin cuenta) ───────────────────────────────

create or replace function public.ajustes_publicos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reservas_web', a.reservas_web,
    'telefono_salon', a.telefono_salon,
    'telefono_hospedaje', a.telefono_hospedaje,
    'hora_llegada', a.hora_llegada,
    'hora_salida', a.hora_salida,
    'anticipo_pct', a.anticipo_pct,
    'horas_apartado', a.horas_apartado,
    'noches_minimas', a.noches_minimas,
    'noches_fin_semana', to_jsonb(a.noches_fin_semana),
    'fecha_maxima', public.hosp_hoy() + a.dias_anticipacion,
    'max_noches', 30,
    'politicas', a.politicas,
    'aviso_privacidad', a.aviso_privacidad
  )
  from public.hospedaje_ajustes a where a.id
$$;

create or replace function public.cabanas_publicas()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', c.slug,
    'nombre', c.nombre,
    'tipo', c.tipo,
    'resumen', c.resumen,
    'descripcion', c.descripcion,
    'capacidad', c.capacidad,
    'recamaras', c.recamaras,
    'camas', c.camas,
    'banos', c.banos,
    'amenidades', to_jsonb(c.amenidades),
    'fotos', c.fotos,
    'precio_noche', c.precio_noche,
    'precio_fin_semana', c.precio_fin_semana,
    'precio_desde', least(c.precio_noche, c.precio_fin_semana),
    'huespedes_incluidos', c.huespedes_incluidos,
    'precio_huesped_extra', c.precio_huesped_extra,
    'noches_minimas', coalesce(c.noches_minimas, a.noches_minimas),
    'reservable', c.precio_noche is not null
  ) order by c.orden, c.nombre), '[]'::jsonb)
  from public.cabanas c cross join public.hospedaje_ajustes a
  where c.publicada and a.id
$$;

-- Fechas ocupadas por cabaña, ya juntas (no se ve cuántas reservaciones hay ni de quién)
create or replace function public.disponibilidad(p_desde date, p_hasta date, p_cabana text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'cabana', c.slug,
    'ocupado', coalesce((
      select jsonb_agg(jsonb_build_object('desde', lower(x), 'hasta', upper(x)) order by lower(x))
      from unnest((
        select range_agg(o.rg) from (
          select daterange(r.llegada, r.salida) as rg from public.reservaciones r
          where r.cabana_id = c.id and r.estado <> 'cancelada'
            and not (r.estado = 'solicitud' and coalesce(r.vence, 'infinity'::timestamptz) < now())
            and r.salida > p_desde and r.llegada < least(p_hasta, p_desde + 400)
          union all
          select daterange(b.inicio, b.fin) from public.bloqueos b
          where b.cabana_id = c.id and b.fin > p_desde and b.inicio < least(p_hasta, p_desde + 400)
        ) o
      )) as x
    ), '[]'::jsonb)
  ) order by c.orden, c.nombre), '[]'::jsonb)
  from public.cabanas c
  where c.publicada and (p_cabana is null or c.slug = p_cabana) and p_desde is not null and p_hasta > p_desde
$$;

create or replace function public.cotizar(p_cabana text, p_llegada date, p_salida date, p_huespedes integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.cabanas;
  aj public.hospedaje_ajustes;
  r jsonb;
  hoy date := public.hosp_hoy();
begin
  select * into aj from public.hospedaje_ajustes where id;
  if not aj.reservas_web then
    return public.hosp_error('cerrado', 'Por ahora no estamos recibiendo reservaciones en línea.');
  end if;
  select * into c from public.cabanas where slug = p_cabana and publicada;
  if not found then
    return public.hosp_error('no_existe', 'No encontramos esa cabaña.');
  end if;
  if p_llegada is null or p_salida is null or p_salida <= p_llegada then
    return public.hosp_error('fechas_invalidas', 'La salida debe ser después de la llegada.');
  end if;
  if p_llegada < hoy then
    return public.hosp_error('pasado', 'La llegada no puede ser antes de hoy.');
  end if;
  if p_llegada > hoy + aj.dias_anticipacion then
    return public.hosp_error('muy_lejos', format('Por ahora recibimos reservaciones hasta el %s de %s.', public.hosp_fecha(hoy + aj.dias_anticipacion), extract(year from hoy + aj.dias_anticipacion)));
  end if;
  if p_salida - p_llegada > 30 then
    return public.hosp_error('muy_largo', 'Para más de 30 noches, escríbenos por WhatsApp.');
  end if;
  r := public.hosp_precio(c.id, p_llegada, p_salida, p_huespedes);
  if not (r ->> 'ok')::boolean then
    return r;
  end if;
  if not (r ->> 'cumple_minimo')::boolean then
    return public.hosp_error('minimo_noches', format('En esas fechas la estancia mínima es de %s noches.', r ->> 'minimo_noches'))
      || jsonb_build_object('minimo_noches', (r ->> 'minimo_noches')::int);
  end if;
  if not (r ->> 'disponible')::boolean then
    return public.hosp_error('no_disponible', 'Esas fechas ya están ocupadas en esta cabaña.');
  end if;
  return (r - 'cumple_minimo' - 'disponible') || jsonb_build_object(
    'cabana', c.slug, 'llegada', p_llegada, 'salida', p_salida, 'huespedes', p_huespedes,
    'anticipo_pct', aj.anticipo_pct, 'horas_apartado', aj.horas_apartado
  );
end
$$;

-- Crea la solicitud y aparta las fechas. Solo la llama la función reservar (llave secreta),
-- que antes revisa el anti-robots y manda la dirección de internet en «ip».
create or replace function public.solicitar_reservacion(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.cabanas;
  aj public.hospedaje_ajustes;
  q jsonb;
  r public.reservaciones;
  v_llegada date;
  v_salida date;
  v_huespedes integer;
  v_nombre text := btrim(regexp_replace(coalesce(p ->> 'nombre', ''), '\s+', ' ', 'g'));
  v_tel text := regexp_replace(coalesce(p ->> 'telefono', ''), '[^0-9]', '', 'g');
  v_correo text := nullif(lower(btrim(coalesce(p ->> 'correo', ''))), '');
  v_ip text := nullif(p ->> 'ip', '');
  h text;
  n integer;
begin
  begin
    v_llegada := (p ->> 'llegada')::date;
    v_salida := (p ->> 'salida')::date;
    v_huespedes := (p ->> 'huespedes')::integer;
  exception when others then
    return public.hosp_error('datos', 'Revisa las fechas y el número de personas.');
  end;
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 120 then
    return public.hosp_error('nombre', 'Escribe tu nombre.');
  end if;
  if char_length(v_tel) not between 10 and 13 then
    return public.hosp_error('telefono', 'Escribe tu WhatsApp a 10 dígitos.');
  end if;
  if v_correo is not null and (char_length(v_correo) > 160 or v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    return public.hosp_error('correo', 'Revisa tu correo.');
  end if;
  if coalesce(p ->> 'acepto', '') <> 'true' then
    return public.hosp_error('acepto', 'Para reservar hay que aceptar las políticas y el aviso de privacidad.');
  end if;

  if v_ip is not null then
    h := md5('hospedaje:' || v_ip);
    select count(*) into n from public.hospedaje_intentos where ip_hash = h and creado > now() - interval '1 hour';
    if n >= 8 then
      return public.hosp_error('demasiados', 'Hiciste muchas solicitudes seguidas. Intenta en una hora o escríbenos por WhatsApp.');
    end if;
    insert into public.hospedaje_intentos (ip_hash) values (h);
  end if;

  perform public.vencer_solicitudes();
  q := public.cotizar(p ->> 'cabana', v_llegada, v_salida, v_huespedes);
  if not (q ->> 'ok')::boolean then
    return q;
  end if;
  select count(*) into n from public.reservaciones where telefono = v_tel and estado = 'solicitud';
  if n >= 3 then
    return public.hosp_error('demasiados', 'Ya tienes solicitudes pendientes. Te escribimos pronto por WhatsApp.');
  end if;

  select * into c from public.cabanas where slug = p ->> 'cabana';
  select * into aj from public.hospedaje_ajustes where id;
  begin
    insert into public.reservaciones (codigo, cabana_id, llegada, salida, huespedes, nombre, telefono, correo, hora_llegada,
      comentarios, origen, estado, total, anticipo, desglose, vence, acepto_politicas)
    values (public.hosp_nuevo_codigo(), c.id, v_llegada, v_salida, v_huespedes, v_nombre, v_tel, v_correo,
      left(nullif(btrim(p ->> 'hora_llegada'), ''), 20), left(nullif(btrim(p ->> 'comentarios'), ''), 1000),
      'web', 'solicitud', (q ->> 'total')::numeric, (q ->> 'anticipo')::numeric, q -> 'desglose',
      now() + make_interval(hours => aj.horas_apartado), now())
    returning * into r;
  exception when exclusion_violation then
    return public.hosp_error('no_disponible', 'Alguien acaba de apartar esas fechas. Elige otras, por favor.');
  end;

  return jsonb_build_object(
    'ok', true,
    'codigo', r.codigo,
    'token', r.token,
    'estado', r.estado,
    'vence', r.vence,
    'cabana', jsonb_build_object('slug', c.slug, 'nombre', c.nombre),
    'llegada', r.llegada,
    'salida', r.salida,
    'noches', r.salida - r.llegada,
    'huespedes', r.huespedes,
    'total', r.total,
    'anticipo', r.anticipo,
    'desglose', r.desglose,
    'pago', case when r.anticipo > 0 then public.hosp_datos_pago(r.codigo, r.anticipo) end,
    'liga', public.hosp_liga(r.token)
  );
end
$$;

-- «Mi reservación»: lo que ve el huésped con su liga privada
create or replace function public.consultar_reservacion(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.reservaciones;
  c public.cabanas;
  aj public.hospedaje_ajustes;
  pagado numeric;
  saldo numeric;
  por_pagar numeric;
begin
  perform public.vencer_solicitudes();
  select * into r from public.reservaciones where token = p_token;
  if not found then
    return public.hosp_error('no_existe', 'No encontramos esa reservación.');
  end if;
  select * into c from public.cabanas where id = r.cabana_id;
  select * into aj from public.hospedaje_ajustes where id;
  select coalesce(sum(monto), 0) into pagado from public.pagos where reservacion_id = r.id;
  saldo := greatest(r.total - pagado, 0);
  por_pagar := case when pagado < r.anticipo then r.anticipo - pagado else saldo end;
  return jsonb_build_object(
    'ok', true,
    'codigo', r.codigo,
    'estado', r.estado,
    'motivo_cancelacion', r.motivo_cancelacion,
    'cabana', jsonb_build_object('slug', c.slug, 'nombre', c.nombre),
    'llegada', r.llegada,
    'salida', r.salida,
    'noches', r.salida - r.llegada,
    'huespedes', r.huespedes,
    'nombre', split_part(r.nombre, ' ', 1),
    'total', r.total,
    'anticipo', r.anticipo,
    'pagado', pagado,
    'saldo', saldo,
    'vence', case when r.estado = 'solicitud' then r.vence end,
    'hora_llegada', aj.hora_llegada,
    'hora_salida', aj.hora_salida,
    'pago', case when r.estado in ('solicitud', 'confirmada') and por_pagar > 0 then public.hosp_datos_pago(r.codigo, por_pagar) end,
    'puede_cancelar', r.estado = 'solicitud' and pagado = 0,
    'telefono_hospedaje', aj.telefono_hospedaje
  );
end
$$;

-- El huésped cancela su solicitud (solo si todavía no paga nada)
create or replace function public.cancelar_mi_reservacion(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.reservaciones;
begin
  select * into r from public.reservaciones where token = p_token for update;
  if not found then
    return public.hosp_error('no_existe', 'No encontramos esa reservación.');
  end if;
  if r.estado <> 'solicitud' or exists (select 1 from public.pagos where reservacion_id = r.id) then
    return public.hosp_error('no_se_puede', 'Esta reservación ya está confirmada. Para cancelarla, escríbenos por WhatsApp.');
  end if;
  update public.reservaciones set estado = 'cancelada', motivo_cancelacion = 'huesped' where id = r.id;
  return public.consultar_reservacion(p_token);
end
$$;

-- ── Funciones de la app de la Mac (equipo de hospedaje) ──────────────

create or replace function public.hosp_reservacion_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(r) || jsonb_build_object(
    'cabana', c.nombre,
    'pagado', coalesce((select sum(p.monto) from public.pagos p where p.reservacion_id = r.id), 0),
    'liga', public.hosp_liga(r.token),
    'pagos', coalesce((select jsonb_agg(to_jsonb(p) order by p.fecha, p.creado) from public.pagos p where p.reservacion_id = r.id), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('creado', e.creado, 'tipo', e.tipo, 'detalle', e.detalle) order by e.creado, e.id) from public.reservacion_eventos e where e.reservacion_id = r.id), '[]'::jsonb)
  )
  from public.reservaciones r join public.cabanas c on c.id = r.cabana_id
  where r.id = p_id
$$;

-- Todo lo que la app necesita para un rango de fechas, en una sola llamada
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
begin
  perform public.hosp_exigir_equipo();
  perform public.vencer_solicitudes();
  return jsonb_build_object(
    'hoy', hoy,
    'ahora', now(),
    'desde', desde,
    'hasta', hasta,
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

create or replace function public.hosp_reservacion(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j jsonb;
begin
  perform public.hosp_exigir_equipo();
  j := public.hosp_reservacion_json(p_id);
  if j is null then
    raise exception 'No encontramos esa reservación' using errcode = 'P0002';
  end if;
  return j;
end
$$;

create or replace function public.hosp_buscar(p_texto text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t text := btrim(coalesce(p_texto, ''));
  dig text := regexp_replace(t, '[^0-9]', '', 'g');
begin
  perform public.hosp_exigir_equipo();
  if char_length(t) < 2 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg((to_jsonb(r) - 'token' - 'desglose') || jsonb_build_object('cabana', c.nombre) order by r.llegada desc)
    from (
      select * from public.reservaciones x
      where x.nombre ilike '%' || t || '%' or x.codigo ilike '%' || t || '%' or x.correo ilike '%' || t || '%'
        or (char_length(dig) >= 4 and x.telefono like '%' || dig || '%')
      order by x.llegada desc limit 50
    ) r join public.cabanas c on c.id = r.cabana_id
  ), '[]'::jsonb);
end
$$;

-- Precio en vivo para el formulario de la app (el dueño puede cotizar cualquier cabaña y fecha)
create or replace function public.hosp_cotizar(p_cabana uuid, p_llegada date, p_salida date, p_huespedes integer, p_ignorar uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.hosp_exigir_equipo();
  return public.hosp_precio(p_cabana, p_llegada, p_salida, p_huespedes, p_ignorar);
end
$$;

create or replace function public.hosp_guardar_cabana(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  c public.cabanas;
begin
  perform public.hosp_exigir_admin();
  if p ? 'nombre' and char_length(btrim(coalesce(p ->> 'nombre', ''))) = 0 then
    raise exception 'La cabaña necesita un nombre' using errcode = '22023';
  end if;
  if p ? 'capacidad' and coalesce((p ->> 'capacidad')::int, 0) < 1 then
    raise exception 'Indica para cuántas personas es la cabaña' using errcode = '22023';
  end if;
  begin
    if v_id is null then
      insert into public.cabanas (slug, nombre, tipo, resumen, descripcion, capacidad, recamaras, camas, banos, amenidades, fotos,
        precio_noche, precio_fin_semana, huespedes_incluidos, precio_huesped_extra, noches_minimas, publicada, orden, notas)
      values (
        p ->> 'slug', btrim(p ->> 'nombre'), coalesce(p ->> 'tipo', 'cabana'), nullif(btrim(p ->> 'resumen'), ''), nullif(btrim(p ->> 'descripcion'), ''),
        (p ->> 'capacidad')::int, nullif(p ->> 'recamaras', '')::int, nullif(btrim(p ->> 'camas'), ''), nullif(p ->> 'banos', '')::numeric,
        coalesce(array(select jsonb_array_elements_text(p -> 'amenidades')), '{}'), coalesce(p -> 'fotos', '[]'::jsonb),
        nullif(p ->> 'precio_noche', '')::numeric, nullif(p ->> 'precio_fin_semana', '')::numeric,
        nullif(p ->> 'huespedes_incluidos', '')::int, nullif(p ->> 'precio_huesped_extra', '')::numeric,
        nullif(p ->> 'noches_minimas', '')::int, coalesce((p ->> 'publicada')::boolean, false),
        coalesce((p ->> 'orden')::int, (select coalesce(max(orden), 0) + 1 from public.cabanas)), nullif(btrim(p ->> 'notas'), '')
      )
      returning * into c;
    else
      update public.cabanas set
        slug = case when p ? 'slug' then p ->> 'slug' else slug end,
        nombre = case when p ? 'nombre' then btrim(p ->> 'nombre') else nombre end,
        tipo = case when p ? 'tipo' then p ->> 'tipo' else tipo end,
        resumen = case when p ? 'resumen' then nullif(btrim(p ->> 'resumen'), '') else resumen end,
        descripcion = case when p ? 'descripcion' then nullif(btrim(p ->> 'descripcion'), '') else descripcion end,
        capacidad = case when p ? 'capacidad' then (p ->> 'capacidad')::int else capacidad end,
        recamaras = case when p ? 'recamaras' then nullif(p ->> 'recamaras', '')::int else recamaras end,
        camas = case when p ? 'camas' then nullif(btrim(p ->> 'camas'), '') else camas end,
        banos = case when p ? 'banos' then nullif(p ->> 'banos', '')::numeric else banos end,
        amenidades = case when p ? 'amenidades' then coalesce(array(select jsonb_array_elements_text(p -> 'amenidades')), '{}') else amenidades end,
        fotos = case when p ? 'fotos' then coalesce(p -> 'fotos', '[]'::jsonb) else fotos end,
        precio_noche = case when p ? 'precio_noche' then nullif(p ->> 'precio_noche', '')::numeric else precio_noche end,
        precio_fin_semana = case when p ? 'precio_fin_semana' then nullif(p ->> 'precio_fin_semana', '')::numeric else precio_fin_semana end,
        huespedes_incluidos = case when p ? 'huespedes_incluidos' then nullif(p ->> 'huespedes_incluidos', '')::int else huespedes_incluidos end,
        precio_huesped_extra = case when p ? 'precio_huesped_extra' then nullif(p ->> 'precio_huesped_extra', '')::numeric else precio_huesped_extra end,
        noches_minimas = case when p ? 'noches_minimas' then nullif(p ->> 'noches_minimas', '')::int else noches_minimas end,
        publicada = case when p ? 'publicada' then coalesce((p ->> 'publicada')::boolean, false) else publicada end,
        orden = case when p ? 'orden' then (p ->> 'orden')::int else orden end,
        notas = case when p ? 'notas' then nullif(btrim(p ->> 'notas'), '') else notas end,
        actualizada = now()
      where id = v_id
      returning * into c;
      if not found then
        raise exception 'No encontramos esa cabaña' using errcode = 'P0002';
      end if;
    end if;
  exception
    when unique_violation then
      raise exception 'Ya hay otra cabaña con la dirección «%»', p ->> 'slug' using errcode = '23505';
    when check_violation then
      raise exception 'Revisa los datos de la cabaña: hay un valor fuera de rango' using errcode = '23514';
  end;
  return to_jsonb(c);
end
$$;

create or replace function public.hosp_borrar_cabana(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.hosp_exigir_admin();
  if exists (select 1 from public.reservaciones where cabana_id = p_id) then
    raise exception 'Esta cabaña tiene reservaciones. Mejor quítala de la web (desactiva «Publicada»).' using errcode = '23503';
  end if;
  delete from public.cabanas where id = p_id;
end
$$;

create or replace function public.hosp_guardar_temporada(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  t public.temporadas;
begin
  perform public.hosp_exigir_admin();
  begin
    if v_id is null then
      insert into public.temporadas (cabana_id, nombre, desde, hasta, precio_noche, noches_minimas)
      values ((p ->> 'cabana_id')::uuid, btrim(p ->> 'nombre'), (p ->> 'desde')::date, (p ->> 'hasta')::date,
        (p ->> 'precio_noche')::numeric, nullif(p ->> 'noches_minimas', '')::int)
      returning * into t;
    else
      update public.temporadas set
        nombre = coalesce(btrim(p ->> 'nombre'), nombre),
        desde = coalesce((p ->> 'desde')::date, desde),
        hasta = coalesce((p ->> 'hasta')::date, hasta),
        precio_noche = coalesce((p ->> 'precio_noche')::numeric, precio_noche),
        noches_minimas = case when p ? 'noches_minimas' then nullif(p ->> 'noches_minimas', '')::int else noches_minimas end
      where id = v_id
      returning * into t;
    end if;
  exception
    when exclusion_violation then
      raise exception 'Esa cabaña ya tiene otra temporada en esas fechas' using errcode = '23P01';
    when check_violation or not_null_violation then
      raise exception 'Revisa el nombre, las fechas y el precio de la temporada' using errcode = '23514';
  end;
  return to_jsonb(t);
end
$$;

create or replace function public.hosp_borrar_temporada(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.hosp_exigir_admin();
  delete from public.temporadas where id = p_id;
end
$$;

create or replace function public.hosp_guardar_bloqueo(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  b public.bloqueos;
begin
  perform public.hosp_exigir_equipo();
  begin
    if v_id is null then
      insert into public.bloqueos (cabana_id, inicio, fin, motivo)
      values ((p ->> 'cabana_id')::uuid, (p ->> 'inicio')::date, (p ->> 'fin')::date, nullif(btrim(p ->> 'motivo'), ''))
      returning * into b;
    else
      update public.bloqueos set
        cabana_id = coalesce((p ->> 'cabana_id')::uuid, cabana_id),
        inicio = coalesce((p ->> 'inicio')::date, inicio),
        fin = coalesce((p ->> 'fin')::date, fin),
        motivo = case when p ? 'motivo' then nullif(btrim(p ->> 'motivo'), '') else motivo end
      where id = v_id
      returning * into b;
    end if;
  exception
    when exclusion_violation then
      raise exception 'Esas fechas ya tienen una reservación o un cierre' using errcode = '23P01';
    when check_violation or not_null_violation then
      raise exception 'Revisa la cabaña y las fechas del cierre' using errcode = '23514';
  end;
  return to_jsonb(b);
end
$$;

create or replace function public.hosp_borrar_bloqueo(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.hosp_exigir_equipo();
  delete from public.bloqueos where id = p_id;
end
$$;

create or replace function public.hosp_guardar_ajustes(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.hospedaje_ajustes;
  v_clabe text := case when p ? 'clabe' then nullif(regexp_replace(coalesce(p ->> 'clabe', ''), '[^0-9]', '', 'g'), '') end;
begin
  perform public.hosp_exigir_admin();
  if v_clabe is not null and char_length(v_clabe) <> 18 then
    raise exception 'La CLABE tiene 18 dígitos' using errcode = '22023';
  end if;
  begin
    update public.hospedaje_ajustes set
      reservas_web = case when p ? 'reservas_web' then coalesce((p ->> 'reservas_web')::boolean, false) else reservas_web end,
      telefono_salon = case when p ? 'telefono_salon' then nullif(btrim(p ->> 'telefono_salon'), '') else telefono_salon end,
      telefono_hospedaje = case when p ? 'telefono_hospedaje' then nullif(btrim(p ->> 'telefono_hospedaje'), '') else telefono_hospedaje end,
      correo_avisos = case when p ? 'correo_avisos' then nullif(lower(btrim(p ->> 'correo_avisos')), '') else correo_avisos end,
      url_web = case when p ? 'url_web' then nullif(btrim(p ->> 'url_web'), '') else url_web end,
      hora_llegada = case when p ? 'hora_llegada' then nullif(p ->> 'hora_llegada', '') else hora_llegada end,
      hora_salida = case when p ? 'hora_salida' then nullif(p ->> 'hora_salida', '') else hora_salida end,
      anticipo_pct = case when p ? 'anticipo_pct' then coalesce(nullif(p ->> 'anticipo_pct', '')::numeric, 0) else anticipo_pct end,
      horas_apartado = case when p ? 'horas_apartado' then (p ->> 'horas_apartado')::int else horas_apartado end,
      noches_minimas = case when p ? 'noches_minimas' then (p ->> 'noches_minimas')::int else noches_minimas end,
      noches_fin_semana = case when p ? 'noches_fin_semana' then coalesce(array(select jsonb_array_elements_text(p -> 'noches_fin_semana')::smallint), '{}') else noches_fin_semana end,
      dias_anticipacion = case when p ? 'dias_anticipacion' then (p ->> 'dias_anticipacion')::int else dias_anticipacion end,
      banco = case when p ? 'banco' then nullif(btrim(p ->> 'banco'), '') else banco end,
      clabe = case when p ? 'clabe' then v_clabe else clabe end,
      titular = case when p ? 'titular' then nullif(btrim(p ->> 'titular'), '') else titular end,
      politicas = case when p ? 'politicas' then nullif(btrim(p ->> 'politicas'), '') else politicas end,
      aviso_privacidad = case when p ? 'aviso_privacidad' then nullif(btrim(p ->> 'aviso_privacidad'), '') else aviso_privacidad end,
      actualizado = now()
    where id
    returning * into a;
  exception when check_violation or not_null_violation then
    raise exception 'Revisa los ajustes: hay un valor fuera de rango (horas como 15:00, porcentaje de 0 a 100)' using errcode = '23514';
  end;
  return to_jsonb(a) - 'id';
end
$$;

-- Reservación capturada por el rancho (llamada, WhatsApp o en persona)
create or replace function public.hosp_crear_reservacion(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  aj public.hospedaje_ajustes;
  q jsonb;
  r public.reservaciones;
  v_cabana uuid := (p ->> 'cabana_id')::uuid;
  v_llegada date := (p ->> 'llegada')::date;
  v_salida date := (p ->> 'salida')::date;
  v_huespedes integer := coalesce(nullif(p ->> 'huespedes', '')::int, 1);
  v_estado text := coalesce(nullif(p ->> 'estado', ''), 'confirmada');
  v_tel text := nullif(regexp_replace(coalesce(p ->> 'telefono', ''), '[^0-9]', '', 'g'), '');
  v_total numeric;
begin
  perform public.hosp_exigir_equipo();
  if v_estado not in ('solicitud', 'confirmada') then
    raise exception 'Una reservación nueva empieza como solicitud o confirmada' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p ->> 'nombre', ''))) < 2 then
    raise exception 'Escribe el nombre del huésped' using errcode = '22023';
  end if;
  if v_tel is not null and char_length(v_tel) not between 10 and 13 then
    raise exception 'El WhatsApp debe tener 10 dígitos' using errcode = '22023';
  end if;
  perform public.vencer_solicitudes();
  q := public.hosp_precio(v_cabana, v_llegada, v_salida, v_huespedes);
  if p ? 'total' and nullif(p ->> 'total', '') is not null then
    v_total := (p ->> 'total')::numeric;
  elsif (q ->> 'ok')::boolean then
    v_total := (q ->> 'total')::numeric;
  else
    raise exception '%', q ->> 'mensaje' using errcode = '22023';
  end if;
  if (q ->> 'ok')::boolean and not (q ->> 'disponible')::boolean then
    raise exception 'Esas fechas ya están ocupadas en esa cabaña' using errcode = '23P01';
  end if;
  select * into aj from public.hospedaje_ajustes where id;
  begin
    insert into public.reservaciones (codigo, cabana_id, llegada, salida, huespedes, nombre, telefono, correo, hora_llegada,
      comentarios, notas, origen, estado, total, anticipo, desglose, vence)
    values (public.hosp_nuevo_codigo(), v_cabana, v_llegada, v_salida, v_huespedes, btrim(p ->> 'nombre'), v_tel,
      nullif(lower(btrim(coalesce(p ->> 'correo', ''))), ''), nullif(btrim(p ->> 'hora_llegada'), ''),
      nullif(btrim(p ->> 'comentarios'), ''), nullif(btrim(p ->> 'notas'), ''),
      coalesce(nullif(p ->> 'origen', ''), 'telefono'), v_estado, v_total, round(v_total * aj.anticipo_pct / 100),
      coalesce(q -> 'desglose', '[]'::jsonb),
      case when v_estado = 'solicitud' then now() + make_interval(hours => aj.horas_apartado) end)
    returning * into r;
  exception
    when exclusion_violation then
      raise exception 'Esas fechas ya están ocupadas en esa cabaña' using errcode = '23P01';
    when check_violation then
      raise exception 'Revisa los datos de la reservación' using errcode = '23514';
  end;
  return public.hosp_reservacion_json(r.id);
end
$$;

-- Mover, alargar o corregir una reservación. Si cambian cabaña, fechas o personas, el total se
-- recalcula con las tarifas (salvo que se mande «total»).
create or replace function public.hosp_actualizar_reservacion(p_id uuid, p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.reservaciones;
  aj public.hospedaje_ajustes;
  q jsonb;
  v_cabana uuid;
  v_llegada date;
  v_salida date;
  v_huespedes integer;
  v_total numeric;
  v_desglose jsonb;
  v_tel text;
begin
  perform public.hosp_exigir_equipo();
  select * into r from public.reservaciones where id = p_id for update;
  if not found then
    raise exception 'No encontramos esa reservación' using errcode = 'P0002';
  end if;
  select * into aj from public.hospedaje_ajustes where id;
  v_cabana := coalesce((p ->> 'cabana_id')::uuid, r.cabana_id);
  v_llegada := coalesce((p ->> 'llegada')::date, r.llegada);
  v_salida := coalesce((p ->> 'salida')::date, r.salida);
  v_huespedes := coalesce((p ->> 'huespedes')::int, r.huespedes);
  v_total := r.total;
  v_desglose := r.desglose;
  if p ? 'total' and nullif(p ->> 'total', '') is not null then
    v_total := (p ->> 'total')::numeric;
  elsif (v_cabana, v_llegada, v_salida, v_huespedes) is distinct from (r.cabana_id, r.llegada, r.salida, r.huespedes) then
    q := public.hosp_precio(v_cabana, v_llegada, v_salida, v_huespedes, r.id);
    if not (q ->> 'ok')::boolean then
      raise exception '%', q ->> 'mensaje' using errcode = '22023';
    end if;
    v_total := (q ->> 'total')::numeric;
    v_desglose := q -> 'desglose';
  end if;
  v_tel := case when p ? 'telefono' then nullif(regexp_replace(coalesce(p ->> 'telefono', ''), '[^0-9]', '', 'g'), '') else r.telefono end;
  if v_tel is not null and char_length(v_tel) not between 10 and 13 then
    raise exception 'El WhatsApp debe tener 10 dígitos' using errcode = '22023';
  end if;
  begin
    update public.reservaciones set
      cabana_id = v_cabana,
      llegada = v_llegada,
      salida = v_salida,
      huespedes = v_huespedes,
      total = v_total,
      anticipo = case when v_total is distinct from r.total then round(v_total * aj.anticipo_pct / 100) else anticipo end,
      desglose = v_desglose,
      nombre = case when p ? 'nombre' then btrim(p ->> 'nombre') else nombre end,
      telefono = v_tel,
      correo = case when p ? 'correo' then nullif(lower(btrim(coalesce(p ->> 'correo', ''))), '') else correo end,
      hora_llegada = case when p ? 'hora_llegada' then nullif(btrim(p ->> 'hora_llegada'), '') else hora_llegada end,
      comentarios = case when p ? 'comentarios' then nullif(btrim(p ->> 'comentarios'), '') else comentarios end,
      notas = case when p ? 'notas' then nullif(btrim(p ->> 'notas'), '') else notas end
    where id = p_id;
  exception
    when exclusion_violation then
      raise exception 'Esas fechas ya están ocupadas en esa cabaña' using errcode = '23P01';
    when check_violation then
      raise exception 'Revisa los datos de la reservación' using errcode = '23514';
  end;
  return public.hosp_reservacion_json(p_id);
end
$$;

create or replace function public.hosp_cambiar_estado(p_id uuid, p_estado text, p_motivo text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.reservaciones;
  aj public.hospedaje_ajustes;
begin
  perform public.hosp_exigir_equipo();
  if p_estado not in ('solicitud', 'confirmada', 'pagada', 'cancelada') then
    raise exception 'Estado desconocido: %', p_estado using errcode = '22023';
  end if;
  select * into r from public.reservaciones where id = p_id for update;
  if not found then
    raise exception 'No encontramos esa reservación' using errcode = 'P0002';
  end if;
  if r.estado = p_estado then
    return public.hosp_reservacion_json(p_id);
  end if;
  select * into aj from public.hospedaje_ajustes where id;
  begin
    update public.reservaciones set
      estado = p_estado,
      motivo_cancelacion = case when p_estado = 'cancelada' then coalesce(nullif(p_motivo, ''), 'rancho') end,
      vence = case when p_estado = 'solicitud' then now() + make_interval(hours => aj.horas_apartado) else vence end
    where id = p_id;
  exception when exclusion_violation then
    raise exception 'Esas fechas ya se ocuparon con otra reservación o un cierre' using errcode = '23P01';
  end;
  return public.hosp_reservacion_json(p_id);
end
$$;

create or replace function public.hosp_registrar_pago(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_res uuid := (p ->> 'reservacion_id')::uuid;
begin
  perform public.hosp_exigir_equipo();
  if not exists (select 1 from public.reservaciones where id = v_res) then
    raise exception 'No encontramos esa reservación' using errcode = 'P0002';
  end if;
  begin
    insert into public.pagos (reservacion_id, monto, metodo, fecha, referencia)
    values (v_res, (p ->> 'monto')::numeric, coalesce(nullif(p ->> 'metodo', ''), 'transferencia'),
      coalesce(nullif(p ->> 'fecha', '')::date, public.hosp_hoy()), nullif(btrim(p ->> 'referencia'), ''));
  exception when check_violation or not_null_violation then
    raise exception 'Revisa el monto y el método del pago' using errcode = '23514';
  end;
  return public.hosp_reservacion_json(v_res);
end
$$;

create or replace function public.hosp_borrar_pago(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_res uuid;
begin
  perform public.hosp_exigir_equipo();
  delete from public.pagos where id = p_id returning reservacion_id into v_res;
  if v_res is null then
    raise exception 'No encontramos ese pago' using errcode = 'P0002';
  end if;
  return public.hosp_reservacion_json(v_res);
end
$$;

-- ── Correos: los toma y los marca la función avisos-hospedaje (llave secreta) ──
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
    returning a.id, a.para, a.asunto, a.cuerpo
  )
  select coalesce(jsonb_agg(to_jsonb(u) order by u.id), '[]'::jsonb) into j from u;
  return j;
end
$$;

create or replace function public.hosp_marcar_aviso(p_id bigint, p_estado text, p_detalle text default null)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.hospedaje_avisos set
    estado = case when p_estado = 'error' and intentos < 5 then 'pendiente' else p_estado end,
    detalle = left(p_detalle, 400),
    actualizado = now()
  where id = p_id
$$;

-- Lo que corre cada 10 minutos: vencer solicitudes y reintentar correos
create or replace function public.hosp_barrido()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  n := public.vencer_solicitudes();
  if exists (select 1 from public.hospedaje_avisos where estado = 'pendiente' and intentos < 5) then
    perform public.edge_post('avisos-hospedaje', '{}'::jsonb);
  end if;
  begin
    perform public.record_backend_run('hospedaje', 'Hospedaje: apartados y correos', true, format('%s solicitudes vencidas', n));
  exception when others then
    null;
  end;
exception when others then
  begin
    perform public.record_backend_run('hospedaje', 'Hospedaje: apartados y correos', false, sqlerrm);
  exception when others then
    null;
  end;
end
$$;

-- ── Permisos ─────────────────────────────────────────────────────────
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'hosp\_%' or p.proname in (
      'ajustes_publicos', 'cabanas_publicas', 'disponibilidad', 'cotizar', 'solicitar_reservacion',
      'consultar_reservacion', 'cancelar_mi_reservacion', 'vencer_solicitudes'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end
$$;

-- La web (sin cuenta) y cualquiera con sesión
grant execute on function public.ajustes_publicos() to anon, authenticated;
grant execute on function public.cabanas_publicas() to anon, authenticated;
grant execute on function public.disponibilidad(date, date, text) to anon, authenticated;
grant execute on function public.cotizar(text, date, date, integer) to anon, authenticated;
grant execute on function public.consultar_reservacion(uuid) to anon, authenticated;
grant execute on function public.cancelar_mi_reservacion(uuid) to anon, authenticated;
-- Solo con la llave secreta (función reservar y función de correos)
grant execute on function public.solicitar_reservacion(jsonb) to service_role;
grant execute on function public.hosp_tomar_avisos() to service_role;
grant execute on function public.hosp_marcar_aviso(bigint, text, text) to service_role;
-- La app de la Mac (cada función revisa además que la cuenta sea del equipo de hospedaje)
grant execute on function public.hosp_es_equipo() to authenticated;
grant execute on function public.hosp_es_admin() to authenticated;
grant execute on function public.hosp_datos(date, date) to authenticated;
grant execute on function public.hosp_reservacion(uuid) to authenticated;
grant execute on function public.hosp_buscar(text) to authenticated;
grant execute on function public.hosp_cotizar(uuid, date, date, integer, uuid) to authenticated;
grant execute on function public.hosp_guardar_cabana(jsonb) to authenticated;
grant execute on function public.hosp_borrar_cabana(uuid) to authenticated;
grant execute on function public.hosp_guardar_temporada(jsonb) to authenticated;
grant execute on function public.hosp_borrar_temporada(uuid) to authenticated;
grant execute on function public.hosp_guardar_bloqueo(jsonb) to authenticated;
grant execute on function public.hosp_borrar_bloqueo(uuid) to authenticated;
grant execute on function public.hosp_guardar_ajustes(jsonb) to authenticated;
grant execute on function public.hosp_crear_reservacion(jsonb) to authenticated;
grant execute on function public.hosp_actualizar_reservacion(uuid, jsonb) to authenticated;
grant execute on function public.hosp_cambiar_estado(uuid, text, text) to authenticated;
grant execute on function public.hosp_registrar_pago(jsonb) to authenticated;
grant execute on function public.hosp_borrar_pago(uuid) to authenticated;

-- ── Versiones de la app de la Mac: las baja la app instalada, sin cuenta. Sin políticas de escritura:
-- solo se sube con la llave secreta, desde GitHub Actions. La app solo instala lo que viene firmado. ──
insert into storage.buckets (id, name, public, file_size_limit)
values ('versiones', 'versiones', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;

-- ── Fotos de las cabañas: públicas (las ve la web); solo el dueño sube o borra ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cabanas', 'cabanas', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true;

drop policy if exists "cabanas fotos leer" on storage.objects;
create policy "cabanas fotos leer" on storage.objects for select to authenticated
  using (bucket_id = 'cabanas' and (select public.hosp_es_admin()));
drop policy if exists "cabanas fotos subir" on storage.objects;
create policy "cabanas fotos subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'cabanas' and (select public.hosp_es_admin()));
drop policy if exists "cabanas fotos reemplazar" on storage.objects;
create policy "cabanas fotos reemplazar" on storage.objects for update to authenticated
  using (bucket_id = 'cabanas' and (select public.hosp_es_admin()));
drop policy if exists "cabanas fotos borrar" on storage.objects;
create policy "cabanas fotos borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'cabanas' and (select public.hosp_es_admin()));

-- ── Tiempo real: solo el equipo de hospedaje escucha el canal «hospedaje» ──
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    execute 'drop policy if exists "hospedaje escucha cambios" on realtime.messages';
    execute $p$create policy "hospedaje escucha cambios" on realtime.messages for select to authenticated
      using ((select realtime.topic()) = 'hospedaje' and (select public.hosp_es_equipo()))$p$;
  end if;
end
$$;

-- ── Tarea programada: cada 10 minutos vence apartados y reintenta correos ──
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('la-joya-hospedaje', '*/10 * * * *', $c$ select public.hosp_barrido() $c$);
exception when others then
  raise notice 'Tarea de hospedaje sin programar (pg_cron no disponible): %', sqlerrm;
end
$$;

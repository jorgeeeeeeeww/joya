// Simulación del rancho completo: los 12 hospedajes reales (los mismos nombres que usa la web),
// reservaciones desde la web en todo tipo de fechas y el dueño trabajando desde la app de la Mac.
// Levanta su propia nube en memoria (puerto 54341). No toca los datos de `npm run nube`.
// Los precios de aquí son SOLO de prueba: los reales los captura el rancho en la app.
//
//   node nube-local/simular-rancho.mjs
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PORT = 54341
const URL_NUBE = `http://127.0.0.1:${PORT}`
const PUBLICA = 'sb_publishable_local'
const ORIGEN = 'http://localhost:4321'

// La misma función con la que la web decide qué hospedaje de la nube es cada edificio del rancho
const { buscarPieza, HOSPEDAJES } = await import(pathToFileURL(join(AQUI, '..', '..', 'web', 'src', 'data', 'plano.ts')).href)

const nube = spawn(process.execPath, [join(AQUI, 'servidor.mjs'), '--memoria'], { env: { ...process.env, NUBE_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] })
let salida = ''
nube.stdout.on('data', (d) => (salida += d))
nube.stderr.on('data', (d) => (salida += d))
process.on('exit', () => nube.kill())

let fallas = 0
let pasos = 0
function revisar(ok, que, detalle) {
  pasos++
  if (ok) console.log(`  ✓ ${que}`)
  else {
    fallas++
    console.log(`  ✗ ${que}${detalle !== undefined ? `\n      ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle).slice(0, 600)}` : ''}`)
  }
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const iso = (d) => d.toISOString().slice(0, 10)
const masDias = (f, n) => {
  const d = new Date(f + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}
const noches = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5)
/** 1 = lunes … 7 = domingo, como isodow de Postgres */
const isodow = (f) => ((new Date(f + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1
const hoyJalisco = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

for (let i = 0; i < 100 && !salida.includes('lista en') && nube.exitCode === null; i++) await espera(150)
if (!salida.includes('lista en')) {
  console.error('La nube local no arrancó:\n' + salida)
  process.exit(1)
}

const opciones = { auth: { persistSession: false, autoRefreshToken: false } }
const web = createClient(URL_NUBE, PUBLICA, opciones)
const dueno = createClient(URL_NUBE, PUBLICA, opciones)
const rpcWeb = async (f, a) => {
  const { data, error } = await web.rpc(f, a)
  if (error) throw new Error(`${f}: ${error.message}`)
  return data
}
const rpcMac = async (f, a) => {
  const { data, error } = await dueno.rpc(f, a)
  if (error) throw Object.assign(new Error(`${f}: ${error.message}`), { code: error.code })
  return data
}
// Cada huésped llega desde su propia conexión y con su propio WhatsApp (como en la vida real)
let huesped = 0
function reservar(datos, { ip, tel } = {}) {
  huesped++
  const cuerpo = {
    nombre: `Huésped ${huesped}`,
    telefono: tel ?? `33${String(10000000 + huesped).slice(-8)}`,
    correo: `huesped${huesped}@correo.mx`,
    acepto: true,
    huespedes: 2,
    ...datos,
  }
  return fetch(`${URL_NUBE}/functions/v1/reservar`, {
    method: 'POST',
    headers: { apikey: PUBLICA, 'Content-Type': 'application/json', Origin: ORIGEN, 'x-forwarded-for': ip ?? `10.0.${Math.floor(huesped / 250)}.${huesped % 250}` },
    body: JSON.stringify(cuerpo),
  }).then(async (r) => ({ status: r.status, ...(await r.json()) }))
}

// ── Los 12 hospedajes reales, con los mismos nombres de la web (web/src/data/lugares.ts) ──
// Capacidades: las que dio Jorge; habitaciones 11 a 16 todavía sin dato, aquí 2 de prueba.
const LUGARES = [
  { slug: 'sabas', nombre: 'Sabas', tipo: 'cabana', capacidad: 6 },
  { slug: 'cabana-san-miguel', nombre: 'Cabaña San Miguel', tipo: 'cabana', capacidad: 10 },
  { slug: 'cabana-elena', nombre: 'Cabaña Elena', tipo: 'cabana', capacidad: 4 },
  ...[11, 12, 13, 14, 15, 16, 1, 2, 3].map((n) => ({ slug: `habitacion-${n}`, nombre: `Habitación ${n}`, tipo: 'habitacion', capacidad: 2 })),
]
const PRECIO = { cabana: [1000, 1300], habitacion: [600, 750] } // [noche normal, fin de semana]: SOLO de prueba

// ═════════════════════════════════════════════════════════════════════
console.log('\n1. El dueño prepara el rancho desde la app de la Mac')
{
  const { error } = await dueno.auth.signInWithPassword({ email: 'dueno@lajoya.local', password: 'la-joya-local' })
  revisar(!error, 'El dueño entra a la app', error?.message)
  await rpcMac('hosp_guardar_ajustes', {
    p: {
      reservas_web: true,
      anticipo_pct: 50,
      horas_apartado: 24,
      hora_llegada: '15:00',
      hora_salida: '12:00',
      banco: 'Banco de prueba',
      clabe: '000 000 000000000000',
      titular: 'Cuenta de prueba',
      url_web: ORIGEN,
      telefono_hospedaje: '33 0000 0000',
      correo_avisos: 'dueno@lajoya.local',
      politicas: 'Políticas de prueba.',
      aviso_privacidad: 'Aviso de prueba.',
    },
  })
  for (const [i, l] of LUGARES.entries()) {
    const [n, f] = PRECIO[l.tipo]
    await rpcMac('hosp_guardar_cabana', { p: { ...l, precio_noche: n, precio_fin_semana: f, publicada: true, orden: i + 1 } })
  }
  const datos = await rpcMac('hosp_datos', {})
  revisar(datos.cabanas.length === 12, 'Los 12 hospedajes quedan dados de alta', datos.cabanas.length)
}

// ═════════════════════════════════════════════════════════════════════
console.log('\n2. La web reconoce los 12 hospedajes')
const AJ = await rpcWeb('ajustes_publicos')
const PUB = await rpcWeb('cabanas_publicas')
{
  revisar(PUB.length === 12, 'La nube publica los 12', PUB.length)
  revisar(AJ.reservas_web && AJ.politicas && AJ.aviso_privacidad, 'La web queda en modo «Reservar en línea» (reservas encendidas, políticas y aviso)')
  // Igual que reservar.ts: solo se muestran los que encuentran su edificio en el plano
  const sinEdificio = PUB.filter((u) => !buscarPieza(u.slug, u.nombre))
  revisar(sinEdificio.length === 0, 'Cada hospedaje de la nube encuentra su edificio en el mapa de la web', sinEdificio.map((u) => u.nombre))
  const libres = [...HOSPEDAJES]
  const piezas = PUB.map((u) => {
    const p = buscarPieza(u.slug, u.nombre, libres)
    if (p) libres.splice(libres.indexOf(p), 1)
    return p?.id
  })
  revisar(new Set(piezas).size === 12 && PUB.every((u, i) => piezas[i] === u.slug), 'Cada uno cae en su propio edificio (la liga «?lugar=» del inicio abre el correcto)', piezas)
  // Nombres que el dueño podría escribir distinto: la web los debe reconocer igual
  const variantes = [['Cabaña Sabas', 'sabas'], ['San Miguel', 'cabana-san-miguel'], ['Elena', 'cabana-elena'], ['Hab. 12', 'habitacion-12'], ['Cuarto 3', 'habitacion-3'], ['Habitacion 15', 'habitacion-15']]
  const malas = variantes.filter(([n, id]) => buscarPieza('otro-slug', n)?.id !== id)
  revisar(malas.length === 0, 'Reconoce nombres escritos distinto («Hab. 12», «Cuarto 3», «Cabaña Sabas», sin acento)', malas)
  const raras = ['Habitación Doce', 'Suite Jardín', 'Casa del Lago'].filter((n) => buscarPieza('x', n))
  revisar(raras.length === 0, 'Un nombre que no existe en el plano NO se muestra en la web (ojo al darlos de alta)', raras)
}

// ═════════════════════════════════════════════════════════════════════
// Modelo propio de lo ocupado: noche por noche, para comparar con la nube
const ocupado = new Map(LUGARES.map((l) => [l.slug, new Set()]))
const reservadas = [] // { slug, codigo, token, llegada, salida, total }
const libreEnModelo = (slug, a, b) => {
  for (let d = a; d < b; d = masDias(d, 1)) if (ocupado.get(slug).has(d)) return false
  return true
}
const apartarEnModelo = (slug, a, b) => {
  for (let d = a; d < b; d = masDias(d, 1)) ocupado.get(slug).add(d)
}
const liberarEnModelo = (slug, a, b) => {
  for (let d = a; d < b; d = masDias(d, 1)) ocupado.get(slug).delete(d)
}
function precioEsperado(l, a, b, personas = 2) {
  const [n, f] = PRECIO[l.tipo]
  let t = 0
  for (let d = a; d < b; d = masDias(d, 1)) t += AJ.noches_fin_semana.includes(isodow(d)) ? f : n
  return t
}

const HOY = hoyJalisco()
const viernes = (() => {
  let d = masDias(HOY, 1)
  while (isodow(d) !== 5) d = masDias(d, 1)
  return d
})()
const finMes = (() => {
  const d = new Date(HOY + 'T12:00:00Z')
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)))
})()
const anio = Number(HOY.slice(0, 4))
const MAX = masDias(HOY, 365)
const ESTANCIAS = [
  ['Mañana, 1 noche', masDias(HOY, 1), masDias(HOY, 2)],
  ['Fin de semana (viernes a domingo)', viernes, masDias(viernes, 2)],
  ['Cruza de un mes al otro', masDias(finMes, -1), masDias(finMes, 2)],
  ['Navidad y Año Nuevo (cruza de año)', `${anio}-12-24`, `${anio + 1}-01-02`],
  ['Una semana que cruza febrero', `${anio + 1}-02-25`, `${anio + 1}-03-04`],
  ['30 noches seguidas (lo más largo en línea)', `${anio + 1}-06-01`, `${anio + 1}-07-01`],
  ['La última llegada que se acepta (en un año)', MAX, masDias(MAX, 2)],
]

console.log('\n3. La web reserva cada hospedaje en todo tipo de fechas')
for (const [que, a, b] of ESTANCIAS) {
  const resultados = await Promise.all(LUGARES.map((l) => reservar({ cabana: l.slug, llegada: a, salida: b, huespedes: Math.min(2, l.capacidad) })))
  const malos = []
  resultados.forEach((r, i) => {
    const l = LUGARES[i]
    const esperado = precioEsperado(l, a, b)
    const sumaNoches = (r.desglose ?? []).reduce((s, x) => s + Number(x.precio), 0)
    if (!r.ok || r.status !== 200) malos.push(`${l.nombre}: ${r.status} ${r.motivo} ${r.mensaje ?? ''}`)
    else if (Number(r.total) !== esperado || sumaNoches !== esperado || r.noches !== noches(a, b)) malos.push(`${l.nombre}: total ${r.total}, esperado ${esperado}`)
    else if (Number(r.anticipo) !== Math.round(esperado / 2) || r.pago?.referencia !== r.codigo || !r.liga?.includes(r.token)) malos.push(`${l.nombre}: anticipo o pago mal`)
    else {
      apartarEnModelo(l.slug, a, b)
      reservadas.push({ slug: l.slug, codigo: r.codigo, token: r.token, llegada: a, salida: b, total: r.total })
    }
  })
  revisar(malos.length === 0, `${que} (${a} → ${b}): los 12 reservados, precio noche por noche y anticipo bien`, malos)
}

// Entrar el mismo día que sale el anterior
{
  // El primer día en que alguien sale (la noche anterior ocupada) y la noche siguiente sigue libre. Antes era fijo
  // «pasado mañana», y los miércoles caía en el fin de semana que ya se reservó arriba (falla de la prueba, no de la nube).
  const salidaLibre = (slug) => {
    let d = masDias(HOY, 2)
    while (libreEnModelo(slug, masDias(d, -1), d) || !libreEnModelo(slug, d, masDias(d, 1))) d = masDias(d, 1)
    return d
  }
  const dias = LUGARES.map((l) => salidaLibre(l.slug))
  const r = await Promise.all(LUGARES.map((l, i) => reservar({ cabana: l.slug, llegada: dias[i], salida: masDias(dias[i], 1) })))
  const ok = r.every((x) => x.ok)
  r.forEach((x, i) => {
    if (!x.ok) return
    const [a, b] = [dias[i], masDias(dias[i], 1)]
    apartarEnModelo(LUGARES[i].slug, a, b)
    reservadas.push({ slug: LUGARES[i].slug, codigo: x.codigo, token: x.token, llegada: a, salida: b })
  })
  revisar(ok, 'Alguien puede llegar el mismo día que sale el huésped anterior', r.filter((x) => !x.ok).map((x) => x.motivo))
}

console.log('\n4. La web rechaza lo que no se puede, con su motivo')
{
  const casos = [
    ['Las mismas fechas ya apartadas', (l) => ({ cabana: l.slug, llegada: masDias(HOY, 1), salida: masDias(HOY, 2) }), 409, 'no_disponible'],
    ['Fechas que se enciman a medias', (l) => ({ cabana: l.slug, llegada: `${anio}-12-20`, salida: `${anio}-12-26` }), 409, 'no_disponible'],
    ['Una estancia que envuelve a otra', (l) => ({ cabana: l.slug, llegada: `${anio + 1}-02-23`, salida: `${anio + 1}-03-06` }), 409, 'no_disponible'],
    ['Llegada en el pasado', (l) => ({ cabana: l.slug, llegada: masDias(HOY, -3), salida: masDias(HOY, -1) }), 400, 'pasado'],
    ['Llegada después de un año', (l) => ({ cabana: l.slug, llegada: masDias(MAX, 1), salida: masDias(MAX, 2) }), 400, 'muy_lejos'],
    ['31 noches', (l) => ({ cabana: l.slug, llegada: `${anio + 1}-08-01`, salida: `${anio + 1}-09-01` }), 400, 'muy_largo'],
    ['Salida antes de la llegada', (l) => ({ cabana: l.slug, llegada: `${anio + 1}-08-05`, salida: `${anio + 1}-08-03` }), 400, 'fechas_invalidas'],
    ['Más personas de las que caben', (l) => ({ cabana: l.slug, llegada: `${anio + 1}-08-10`, salida: `${anio + 1}-08-11`, huespedes: l.capacidad + 1 }), 400, 'capacidad'],
    ['Un hospedaje que no existe', () => ({ cabana: 'casa-inventada', llegada: `${anio + 1}-08-10`, salida: `${anio + 1}-08-11` }), 400, 'no_existe'],
  ]
  for (const [que, datos, status, motivo] of casos) {
    const r = await Promise.all(LUGARES.map((l) => reservar(datos(l))))
    const malos = r.filter((x) => x.ok || x.status !== status || x.motivo !== motivo).map((x) => `${x.status} ${x.motivo}`)
    revisar(malos.length === 0, `${que} → ${status} «${motivo}» en los 12`, malos)
  }
  const sinAcepto = await reservar({ cabana: 'sabas', llegada: `${anio + 1}-08-10`, salida: `${anio + 1}-08-11`, acepto: false })
  revisar(sinAcepto.motivo === 'acepto', 'Sin aceptar políticas no se crea', sinAcepto.motivo)
  const telMal = await reservar({ cabana: 'sabas', llegada: `${anio + 1}-08-10`, salida: `${anio + 1}-08-11` }, { tel: '12345' })
  revisar(telMal.motivo === 'telefono', 'Un WhatsApp incompleto se rechaza', telMal.motivo)
}

console.log('\n5. Dos personas piden lo mismo al mismo tiempo')
{
  const a = `${anio + 1}-04-10`
  const b = `${anio + 1}-04-12`
  const r = await Promise.all(LUGARES.flatMap((l) => Array.from({ length: 5 }, () => reservar({ cabana: l.slug, llegada: a, salida: b }).then((x) => ({ ...x, slug: l.slug })))))
  const malos = LUGARES.filter((l) => {
    const de = r.filter((x) => x.slug === l.slug)
    return de.filter((x) => x.ok).length !== 1 || de.filter((x) => x.status === 409).length !== 4
  })
  for (const x of r.filter((x) => x.ok)) apartarEnModelo(x.slug, a, b), reservadas.push({ slug: x.slug, codigo: x.codigo, token: x.token, llegada: a, salida: b })
  revisar(malos.length === 0, '60 solicitudes a la vez (5 por hospedaje): solo 1 gana en cada uno, las otras 4 reciben 409', malos.map((l) => l.nombre))
}

console.log('\n6. 400 solicitudes al azar en cualquier fecha del próximo año')
{
  let semilla = 20261110
  const azar = (n) => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31), Math.floor((semilla / 2 ** 31) * n))
  let aciertos = 0
  const diferencias = []
  for (let i = 0; i < 400; i++) {
    const l = LUGARES[azar(12)]
    const a = masDias(HOY, azar(366))
    const b = masDias(a, 1 + azar(10))
    const esperaOk = libreEnModelo(l.slug, a, b)
    const r = await reservar({ cabana: l.slug, llegada: a, salida: b, huespedes: 1 + azar(l.capacidad) })
    if (r.ok) apartarEnModelo(l.slug, a, b), reservadas.push({ slug: l.slug, codigo: r.codigo, token: r.token, llegada: a, salida: b })
    if (!!r.ok === esperaOk && (r.ok || r.motivo === 'no_disponible')) aciertos++
    else diferencias.push(`${l.slug} ${a}→${b}: esperaba ${esperaOk ? 'sí' : 'no'}, la nube dijo ${r.status} ${r.motivo ?? 'ok'}`)
  }
  revisar(diferencias.length === 0, `La nube contestó igual que el modelo en ${aciertos} de 400 (sí cuando estaba libre, 409 cuando no)`, diferencias.slice(0, 5))
}

console.log('\n7. La app de la Mac ve exactamente lo mismo')
let datosMac
{
  datosMac = await rpcMac('hosp_datos', { p_desde: masDias(HOY, -120), p_hasta: masDias(HOY, 540) }) // el mismo rango que pide la app
  const porCodigo = new Map(datosMac.reservaciones.map((r) => [r.codigo, r]))
  const faltan = reservadas.filter((x) => !porCodigo.has(x.codigo))
  revisar(faltan.length === 0, `Las ${reservadas.length} solicitudes de la web aparecen en la app, hasta la de dentro de un año`, faltan.slice(0, 5))
  const ids = new Map(datosMac.cabanas.map((c) => [c.id, c.slug]))
  const malUbicadas = reservadas.filter((x) => {
    const r = porCodigo.get(x.codigo)
    return r && (ids.get(r.cabana_id) !== x.slug || r.llegada !== x.llegada || r.salida !== x.salida || r.origen !== 'web' || r.estado !== 'solicitud')
  })
  revisar(malUbicadas.length === 0, 'Cada una en su hospedaje, con sus fechas, «de la web» y «por atender»', malUbicadas.slice(0, 3))
  // Ningún empalme dentro de la base
  const empalmes = []
  for (const c of datosMac.cabanas) {
    const rs = datosMac.reservaciones.filter((r) => r.cabana_id === c.id && r.estado !== 'cancelada').sort((x, y) => (x.llegada < y.llegada ? -1 : 1))
    for (let i = 1; i < rs.length; i++) if (rs[i].llegada < rs[i - 1].salida) empalmes.push(`${c.nombre}: ${rs[i - 1].codigo} y ${rs[i].codigo}`)
  }
  revisar(empalmes.length === 0, 'Ninguna reservación se empalma con otra en ningún hospedaje', empalmes)
  const conteo = LUGARES.map((l) => `${l.nombre}: ${datosMac.reservaciones.filter((r) => ids.get(r.cabana_id) === l.slug).length}`)
  console.log(`      ${conteo.join(' · ')}`)
}

// Lo que la web pinta como ocupado debe ser idéntico al modelo
async function compararCalendario(que) {
  const disp = await rpcWeb('disponibilidad', { p_desde: HOY, p_hasta: masDias(HOY, 399) })
  const malos = []
  for (const c of disp) {
    const s = new Set()
    for (const o of c.ocupado) for (let d = o.desde; d < o.hasta; d = masDias(d, 1)) s.add(d)
    const m = ocupado.get(c.cabana)
    const sobran = [...s].filter((d) => !m.has(d))
    const faltan = [...m].filter((d) => d >= HOY && !s.has(d))
    if (sobran.length || faltan.length) malos.push(`${c.cabana}: sobran ${sobran.slice(0, 3)} faltan ${faltan.slice(0, 3)}`)
  }
  revisar(disp.length === 12 && malos.length === 0, que, malos)
}
await compararCalendario('El calendario de la web tacha exactamente las noches ocupadas de los 12 (sin nombres)')

console.log('\n8. El dueño atiende desde la Mac y el huésped lo ve en «Mi reservación»')
{
  const porSlug = (s) => reservadas.find((x) => x.slug === s && x.llegada === ESTANCIAS[3][1])
  const id = (x) => datosMac.reservaciones.find((r) => r.codigo === x.codigo).id
  // Confirma y cobra la de Navidad de los 12
  const malos = []
  for (const l of LUGARES) {
    const x = porSlug(l.slug)
    try {
      await rpcMac('hosp_cambiar_estado', { p_id: id(x), p_estado: 'confirmada' })
      let mia = await rpcWeb('consultar_reservacion', { p_token: x.token })
      if (mia.estado !== 'confirmada' || mia.puede_cancelar) malos.push(`${l.nombre}: tras confirmar ${mia.estado}`)
      await rpcMac('hosp_registrar_pago', { p: { reservacion_id: id(x), monto: Math.round(x.total / 2), metodo: 'transferencia' } })
      mia = await rpcWeb('consultar_reservacion', { p_token: x.token })
      if (mia.estado !== 'confirmada' || Number(mia.saldo) !== x.total - Math.round(x.total / 2)) malos.push(`${l.nombre}: tras anticipo ${mia.estado} saldo ${mia.saldo}`)
      await rpcMac('hosp_registrar_pago', { p: { reservacion_id: id(x), monto: x.total - Math.round(x.total / 2), metodo: 'efectivo' } })
      mia = await rpcWeb('consultar_reservacion', { p_token: x.token })
      if (mia.estado !== 'pagada' || Number(mia.saldo) !== 0) malos.push(`${l.nombre}: tras liquidar ${mia.estado}`)
    } catch (e) {
      malos.push(`${l.nombre}: ${e.message}`)
    }
  }
  revisar(malos.length === 0, 'En los 12: confirmar → anticipo → liquidar; el huésped ve confirmada, su saldo y luego pagada', malos)

  // El huésped cancela la de mañana desde su liga en los 12 → la web puede volver a venderla
  const canceladas = []
  for (const l of LUGARES) {
    const x = reservadas.find((y) => y.slug === l.slug && y.llegada === masDias(HOY, 1))
    const r = await rpcWeb('cancelar_mi_reservacion', { p_token: x.token })
    if (r.estado === 'cancelada' && r.motivo_cancelacion === 'huesped') liberarEnModelo(l.slug, x.llegada, x.salida), canceladas.push(l.slug)
  }
  revisar(canceladas.length === 12, 'El huésped cancela su solicitud desde «Mi reservación» en los 12', 12 - canceladas.length)
  const otra = await Promise.all(LUGARES.map((l) => reservar({ cabana: l.slug, llegada: masDias(HOY, 1), salida: masDias(HOY, 2) })))
  otra.forEach((x, i) => x.ok && apartarEnModelo(LUGARES[i].slug, masDias(HOY, 1), masDias(HOY, 2)))
  revisar(otra.every((x) => x.ok), 'Esas fechas quedan libres y otro huésped las reserva enseguida', otra.filter((x) => !x.ok).map((x) => x.motivo))

  const pagada = porSlug('sabas')
  const noSe = await rpcWeb('cancelar_mi_reservacion', { p_token: pagada.token })
  revisar(noSe.ok === false && noSe.motivo === 'no_se_puede', 'Una reservación pagada ya no se cancela desde la web', noSe)
}

console.log('\n9. Lo que captura el dueño también cierra la web')
{
  /** La primera ventana libre de n noches desde una fecha (según el modelo) */
  const libreDesde = (slug, desde, n) => {
    let a = desde
    while (!libreEnModelo(slug, a, masDias(a, n))) a = masDias(a, 1)
    return a
  }
  const datos = await rpcMac('hosp_datos', {})
  const malos = []
  const tel = new Map()
  for (const c of datos.cabanas) {
    const a = libreDesde(c.slug, `${anio + 1}-09-10`, 3)
    try {
      await rpcMac('hosp_crear_reservacion', { p: { cabana_id: c.id, llegada: a, salida: masDias(a, 3), huespedes: 1, nombre: 'Reserva por teléfono', telefono: '3311112222', origen: 'telefono' } })
      apartarEnModelo(c.slug, a, masDias(a, 3))
      tel.set(c.slug, a)
    } catch (e) {
      malos.push(`${c.nombre}: ${e.message}`)
    }
  }
  revisar(malos.length === 0, 'El dueño captura una reservación por teléfono en cada uno de los 12', malos)
  const web1 = await Promise.all(LUGARES.map((l) => reservar({ cabana: l.slug, llegada: masDias(tel.get(l.slug), 1), salida: masDias(tel.get(l.slug), 2) })))
  revisar(web1.every((x) => x.status === 409), 'La web ya no puede vender esas noches', web1.map((x) => x.status))

  let doble = 0
  for (const c of datos.cabanas) {
    try {
      await rpcMac('hosp_crear_reservacion', { p: { cabana_id: c.id, llegada: masDias(tel.get(c.slug), 2), salida: masDias(tel.get(c.slug), 4), huespedes: 1, nombre: 'Doble', origen: 'telefono' } })
    } catch {
      doble++
    }
  }
  revisar(doble === 12, 'El dueño tampoco puede empalmar dos reservaciones', 12 - doble)

  const cierre = new Map()
  const mal2 = []
  for (const c of datos.cabanas) {
    const c1 = libreDesde(c.slug, `${anio + 1}-10-01`, 4)
    try {
      await rpcMac('hosp_guardar_bloqueo', { p: { cabana_id: c.id, inicio: c1, fin: masDias(c1, 4), motivo: 'Mantenimiento' } })
      apartarEnModelo(c.slug, c1, masDias(c1, 4))
      cierre.set(c.slug, c1)
    } catch (e) {
      mal2.push(`${c.nombre}: ${e.message}`)
    }
  }
  revisar(mal2.length === 0, 'El dueño cierra 4 noches por mantenimiento en cada uno', mal2)
  const web2 = await Promise.all(LUGARES.map((l) => reservar({ cabana: l.slug, llegada: masDias(cierre.get(l.slug), 2), salida: masDias(cierre.get(l.slug), 3) })))
  revisar(web2.every((x) => x.status === 409), 'Fechas cerradas por mantenimiento: la web no las vende', web2.map((x) => x.status))
  let sobre = 0
  for (const c of datos.cabanas) {
    try {
      await rpcMac('hosp_guardar_bloqueo', { p: { cabana_id: c.id, inicio: `${anio + 1}-06-10`, fin: `${anio + 1}-06-12`, motivo: 'Encima' } })
    } catch {
      sobre++
    }
  }
  revisar(sobre === 12, 'No deja cerrar fechas que ya tienen una reservación (las 30 noches de junio)', 12 - sobre)
}

console.log('\n10. Apartados que vencen y límites anti-abuso')
{
  const x = reservadas.find((y) => y.slug === 'habitacion-1' && y.llegada === ESTANCIAS[4][1])
  const id = datosMac.reservaciones.find((r) => r.codigo === x.codigo).id
  await fetch(`${URL_NUBE}/__vencer?id=${id}`, { method: 'POST' })
  liberarEnModelo(x.slug, x.llegada, x.salida)
  const r = await reservar({ cabana: x.slug, llegada: x.llegada, salida: x.salida })
  if (r.ok) apartarEnModelo(x.slug, x.llegada, x.salida)
  revisar(r.ok, 'Si el dueño no confirma a tiempo, el apartado vence y otro huésped puede tomar las fechas', r)
  const mia = await rpcWeb('consultar_reservacion', { p_token: x.token })
  revisar(mia.estado === 'cancelada' && mia.motivo_cancelacion === 'vencida', '«Mi reservación» le dice al primero que venció su apartado', mia.estado)

  const ip = '200.1.2.3'
  const seguidas = []
  let d = `${anio + 1}-07-05`
  for (let i = 0; i < 9; i++) {
    while (!libreEnModelo('habitacion-16', d, masDias(d, 1))) d = masDias(d, 1)
    const s = await reservar({ cabana: 'habitacion-16', llegada: d, salida: masDias(d, 1) }, { ip })
    if (s.ok) apartarEnModelo('habitacion-16', d, masDias(d, 1))
    seguidas.push(s)
    d = masDias(d, 1)
  }
  revisar(seguidas.slice(0, 8).every((s) => s.ok) && seguidas[8].status === 429, 'Desde una misma conexión: 8 solicitudes por hora, la 9.ª recibe 429', seguidas.map((s) => s.status))
  const tel = '3399998888'
  const mismas = []
  // Cada una en una noche que siga libre (antes eran fechas fijas que a veces ya había tomado el paso 6)
  let dt = `${anio + 1}-03-20`
  for (let i = 0; i < 4; i++) {
    while (!libreEnModelo('habitacion-15', dt, masDias(dt, 1))) dt = masDias(dt, 1)
    const s = await reservar({ cabana: 'habitacion-15', llegada: dt, salida: masDias(dt, 1) }, { tel })
    if (s.ok) apartarEnModelo('habitacion-15', dt, masDias(dt, 1))
    mismas.push(s)
    dt = masDias(dt, 2)
  }
  revisar(mismas.slice(0, 3).every((s) => s.ok) && mismas[3].status === 429, 'Un mismo WhatsApp puede tener 3 solicitudes pendientes, la 4.ª no', mismas.map((s) => s.status))
}

await compararCalendario('Al final, el calendario de la web sigue idéntico al modelo tras confirmar, cancelar, vencer y cerrar')

{
  const estado = await fetch(`${URL_NUBE}/__estado`).then((r) => r.json())
  const correos = await fetch(`${URL_NUBE}/__correos`).then((r) => r.json())
  console.log(`\n   Nube al final: ${JSON.stringify(estado)} · ${correos.length} correos simulados`)
}

console.log(`\n${pasos - fallas} de ${pasos} revisiones bien${fallas ? ` · ${fallas} con problema` : ''}\n`)
process.exit(fallas ? 1 : 0)

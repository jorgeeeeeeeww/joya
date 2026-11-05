// Prueba de punta a punta del contrato de hospedaje, contra la nube local (Postgres de verdad).
// Levanta su propia nube en memoria (puerto 54339), hace lo que haría la web y lo que haría el dueño
// en la app de la Mac, y revisa cada paso. No toca los datos de `npm run nube`.
//
//   npm run probar
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PORT = 54339
const URL_NUBE = `http://127.0.0.1:${PORT}`
const PUBLICA = 'sb_publishable_local'

const nube = spawn(process.execPath, [join(AQUI, 'servidor.mjs'), '--memoria'], { env: { ...process.env, NUBE_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] })
let salida = ''
nube.stdout.on('data', (d) => (salida += d))
nube.stderr.on('data', (d) => (salida += d))
const cerrar = () => nube.kill()
process.on('exit', cerrar)

let fallas = 0
let pasos = 0
function revisar(ok, que, detalle) {
  pasos++
  if (ok) console.log(`  ✓ ${que}`)
  else {
    fallas++
    console.log(`  ✗ ${que}${detalle !== undefined ? `\n      ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}` : ''}`)
  }
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const iso = (d) => d.toISOString().slice(0, 10)
const masDias = (fecha, n) => {
  const d = new Date(fecha + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

for (let i = 0; i < 100; i++) {
  if (salida.includes('lista en')) break
  if (nube.exitCode !== null) break
  await espera(150)
}
if (!salida.includes('lista en')) {
  console.error('La nube local no arrancó:\n' + salida)
  process.exit(1)
}

const web = createClient(URL_NUBE, PUBLICA, { auth: { persistSession: false, autoRefreshToken: false } })
const dueno = createClient(URL_NUBE, PUBLICA, { auth: { persistSession: false, autoRefreshToken: false } })
const limpieza = createClient(URL_NUBE, PUBLICA, { auth: { persistSession: false, autoRefreshToken: false } })
const reservar = (datos) =>
  fetch(`${URL_NUBE}/functions/v1/reservar`, { method: 'POST', headers: { apikey: PUBLICA, 'Content-Type': 'application/json', Origin: 'http://localhost:4321' }, body: JSON.stringify(datos) }).then(async (r) => ({ status: r.status, ...(await r.json()) }))

console.log('\n1. El dueño entra y configura')
{
  const { error } = await dueno.auth.signInWithPassword({ email: 'dueno@lajoya.local', password: 'la-joya-local' })
  revisar(!error, 'El dueño inicia sesión con correo y contraseña', error?.message)
  const mal = await web.auth.signInWithPassword({ email: 'dueno@lajoya.local', password: 'otra' })
  revisar(!!mal.error, 'Una contraseña equivocada no entra')
  await limpieza.auth.signInWithPassword({ email: 'limpieza@lajoya.local', password: 'la-joya-local' })
}
const { data: datos0, error: e0 } = await dueno.rpc('hosp_datos')
revisar(!e0 && datos0?.cabanas?.length === 0, 'La nube empieza sin cabañas (nada inventado)', e0?.message ?? datos0?.cabanas)
const hoy = datos0.hoy

{
  const { data, error } = await dueno.rpc('hosp_guardar_ajustes', { p: { reservas_web: true, anticipo_pct: 50, horas_apartado: 24, hora_llegada: '15:00', hora_salida: '12:00', telefono_salon: '33 0000 0000', telefono_hospedaje: '33 1111 1111', correo_avisos: 'dueno@lajoya.local', url_web: 'http://localhost:4321', banco: 'Banco de prueba', clabe: '0000 0000 0000 0000 00', titular: 'Cuenta de prueba' } })
  revisar(!error && data.clabe === '000000000000000000', 'Guarda los ajustes (la CLABE se limpia de espacios)', error?.message ?? data)
  const mala = await dueno.rpc('hosp_guardar_ajustes', { p: { clabe: '123' } })
  revisar(!!mala.error && mala.error.message.includes('18'), 'Rechaza una CLABE que no tiene 18 dígitos', mala.error?.message)
}
const { data: cabana, error: eCab } = await dueno.rpc('hosp_guardar_cabana', {
  p: { slug: 'cabana-prueba', nombre: 'Cabaña de prueba', capacidad: 4, precio_noche: 1000, precio_fin_semana: 1300, huespedes_incluidos: 2, precio_huesped_extra: 150, publicada: true, amenidades: ['Wi-Fi'] },
})
revisar(!eCab && cabana?.id, 'El dueño da de alta una cabaña con sus precios', eCab?.message)
{
  const { error } = await dueno.rpc('hosp_guardar_cabana', { p: { slug: 'cabana-prueba', nombre: 'Otra', capacidad: 2 } })
  revisar(!!error && error.message.includes('cabana-prueba'), 'No deja repetir la dirección de una cabaña', error?.message)
  const oculta = await dueno.rpc('hosp_guardar_cabana', { p: { slug: 'cabana-oculta', nombre: 'Cabaña sin publicar', capacidad: 2, precio_noche: 900 } })
  revisar(!oculta.error, 'Da de alta una segunda cabaña sin publicarla', oculta.error?.message)
  const hab = await dueno.rpc('hosp_guardar_cabana', { p: { slug: 'habitacion-oculta', nombre: 'Habitación sin publicar', tipo: 'habitacion', capacidad: 2 } })
  revisar(!hab.error && hab.data?.tipo === 'habitacion', 'Da de alta una habitación de hotel', hab.error?.message ?? hab.data)
  const mal = await dueno.rpc('hosp_guardar_cabana', { p: { slug: 'otro-tipo', nombre: 'Otro', tipo: 'hotel', capacidad: 2 } })
  revisar(!!mal.error, 'Solo acepta cabaña, casa o habitación', mal.data)
}
{
  const ini = masDias(hoy, 40)
  const { error } = await dueno.rpc('hosp_guardar_temporada', { p: { cabana_id: cabana.id, nombre: 'Temporada de prueba', desde: ini, hasta: masDias(ini, 2), precio_noche: 2000, noches_minimas: 2 } })
  revisar(!error, 'Agrega una temporada con precio especial', error?.message)
}

console.log('\n2. La web (sin cuenta)')
{
  const { data: aj } = await web.rpc('ajustes_publicos')
  revisar(aj?.telefono_salon === '33 0000 0000' && aj?.reservas_web === true && !('clabe' in aj) && !('correo_avisos' in aj), 'Ajustes públicos: teléfono del salón, sin CLABE ni correo del dueño', aj)
  const { data: cabs } = await web.rpc('cabanas_publicas')
  revisar(cabs?.length === 1 && cabs[0].slug === 'cabana-prueba' && cabs[0].precio_desde === 1000 && !('notas' in cabs[0]), 'Solo salen las cabañas publicadas, sin notas internas', cabs)
  const directo = await web.rpc('hosp_datos')
  revisar(!!directo.error, 'La web no puede leer los datos del dueño', directo.data)
  const tabla = await fetch(`${URL_NUBE}/rest/v1/reservaciones?select=*`, { headers: { apikey: PUBLICA } })
  revisar(tabla.status === 403, 'Las tablas están cerradas para la web')
  const solicitarDirecto = await web.rpc('solicitar_reservacion', { p: {} })
  revisar(!!solicitarDirecto.error, 'La web no puede saltarse la función reservar', solicitarDirecto.data)
}

// Un viernes a 3 semanas: viernes y sábado son noches de fin de semana
let viernes = masDias(hoy, 21)
while (new Date(viernes + 'T12:00:00Z').getUTCDay() !== 5) viernes = masDias(viernes, 1)
const domingo = masDias(viernes, 2)
{
  const { data: q } = await web.rpc('cotizar', { p_cabana: 'cabana-prueba', p_llegada: viernes, p_salida: domingo, p_huespedes: 3 })
  // 2 noches de fin de semana (1300 c/u) + 1 persona extra × 2 noches × 150
  revisar(q?.ok && q.total === 2900 && q.anticipo === 1450 && q.extra === 300 && q.desglose?.every((n) => n.tipo === 'fin_semana'), 'Cotiza noche por noche con fin de semana y persona extra', q)
  const lleno = await web.rpc('cotizar', { p_cabana: 'cabana-prueba', p_llegada: viernes, p_salida: domingo, p_huespedes: 9 })
  revisar(lleno.data?.motivo === 'capacidad', 'No deja más personas que la capacidad', lleno.data)
  const pasado = await web.rpc('cotizar', { p_cabana: 'cabana-prueba', p_llegada: masDias(hoy, -2), p_salida: hoy, p_huespedes: 2 })
  revisar(pasado.data?.motivo === 'pasado', 'No deja reservar en el pasado', pasado.data)
  const ini = masDias(hoy, 40)
  const corta = await web.rpc('cotizar', { p_cabana: 'cabana-prueba', p_llegada: ini, p_salida: masDias(ini, 1), p_huespedes: 2 })
  revisar(corta.data?.motivo === 'minimo_noches' && corta.data?.minimo_noches === 2, 'Respeta el mínimo de noches de la temporada', corta.data)
  const temporada = await web.rpc('cotizar', { p_cabana: 'cabana-prueba', p_llegada: ini, p_salida: masDias(ini, 2), p_huespedes: 2 })
  revisar(temporada.data?.ok && temporada.data.total === 4000 && temporada.data.desglose[0].temporada === 'Temporada de prueba', 'Cobra el precio de la temporada', temporada.data)
  const oculta = await web.rpc('cotizar', { p_cabana: 'cabana-oculta', p_llegada: viernes, p_salida: domingo, p_huespedes: 2 })
  revisar(oculta.data?.motivo === 'no_existe', 'Una cabaña sin publicar no se puede cotizar', oculta.data)
}

const huesped = { cabana: 'cabana-prueba', llegada: viernes, salida: domingo, huespedes: 3, nombre: 'Huésped de Prueba', telefono: '33 1234 5678', correo: 'huesped@prueba.mx', hora_llegada: '17:00', comentarios: 'Llegamos con un perro pequeño', acepto: true }
let solicitud
{
  const sin = await reservar({ ...huesped, acepto: false })
  revisar(sin.status === 400 && sin.motivo === 'acepto', 'Sin aceptar políticas no se crea la solicitud', sin)
  solicitud = await reservar(huesped)
  revisar(solicitud.status === 200 && solicitud.ok && /^LJ-[A-Z0-9]{4}$/.test(solicitud.codigo) && solicitud.estado === 'solicitud', `La web crea la solicitud ${solicitud.codigo ?? ''}`, solicitud)
  revisar(solicitud.pago?.clabe === '000000000000000000' && solicitud.pago?.monto === 1450 && solicitud.pago?.referencia === solicitud.codigo, 'Devuelve los datos para transferir el anticipo con el código como referencia', solicitud.pago)
  revisar(typeof solicitud.liga === 'string' && solicitud.liga.includes(solicitud.token), 'Devuelve la liga privada «Mi reservación»', solicitud.liga)
  const doble = await reservar({ ...huesped, telefono: '3399998888', nombre: 'Otra Persona' })
  revisar(doble.status === 409 && doble.motivo === 'no_disponible', 'Nadie más puede apartar esas mismas fechas', doble)
  const { data: disp } = await web.rpc('disponibilidad', { p_desde: hoy, p_hasta: masDias(hoy, 60) })
  const ocup = disp?.find((d) => d.cabana === 'cabana-prueba')?.ocupado
  revisar(ocup?.length === 1 && ocup[0].desde === viernes && ocup[0].hasta === domingo && !JSON.stringify(disp).includes('Prueba'), 'Las fechas salen ocupadas en la web, sin nombres', disp)
  const { data: mia } = await web.rpc('consultar_reservacion', { p_token: solicitud.token })
  revisar(mia?.ok && mia.estado === 'solicitud' && mia.nombre === 'Huésped' && mia.puede_cancelar === true && mia.pago?.monto === 1450, '«Mi reservación» muestra el estado y lo que falta pagar', mia)
}

console.log('\n3. La app de la Mac recibe la solicitud')
{
  await espera(500)
  const { data } = await dueno.rpc('hosp_datos')
  const r = data.reservaciones.find((x) => x.codigo === solicitud.codigo)
  revisar(r && r.estado === 'solicitud' && r.nombre === 'Huésped de Prueba' && r.telefono === '3312345678' && r.vence && !('token' in r), 'La solicitud aparece en la app del dueño con sus datos', r)
  const lim = await limpieza.rpc('hosp_datos')
  revisar(!!lim.error, 'Una cuenta de limpieza no ve las reservaciones', lim.data)
  const detalle = await dueno.rpc('hosp_reservacion', { p_id: r.id })
  revisar(detalle.data?.eventos?.[0]?.detalle === 'Llegó de la página web', 'La historia dice que llegó de la web', detalle.data?.eventos)
  const correos = await fetch(`${URL_NUBE}/__correos`).then((x) => x.json())
  revisar(correos.some((c) => c.para === 'dueno@lajoya.local' && c.asunto.includes(solicitud.codigo)) && correos.some((c) => c.para === 'huesped@prueba.mx'), 'Sale el correo al dueño y el acuse al huésped', correos.map((c) => `${c.para}: ${c.asunto}`))

  const mover = await dueno.rpc('hosp_actualizar_reservacion', { p_id: r.id, p: { llegada: masDias(viernes, -1), salida: domingo } })
  // jueves 1000 + viernes 1300 + sábado 1300 + 1 persona extra × 3 noches × 150
  revisar(!mover.error && mover.data.total === 4050 && mover.data.anticipo === 2025, 'Alargar una noche recalcula el total y el anticipo', mover.error?.message ?? mover.data)
  const total = mover.data.total
  const anticipoDebido = mover.data.anticipo
  const bloqueo = await dueno.rpc('hosp_guardar_bloqueo', { p: { cabana_id: cabana.id, inicio: viernes, fin: masDias(viernes, 1), motivo: 'Mantenimiento' } })
  revisar(!!bloqueo.error, 'No deja cerrar fechas que ya tienen una reservación', bloqueo.error?.message)
  const cierre = await dueno.rpc('hosp_guardar_bloqueo', { p: { cabana_id: cabana.id, inicio: masDias(domingo, 3), fin: masDias(domingo, 5), motivo: 'Uso propio' } })
  revisar(!cierre.error, 'Cierra otras fechas por uso propio', cierre.error?.message)
  const encima = await reservar({ ...huesped, telefono: '3311112222', llegada: masDias(domingo, 4), salida: masDias(domingo, 6) })
  revisar(encima.motivo === 'no_disponible', 'La web no deja reservar sobre un cierre', encima)

  const conf = await dueno.rpc('hosp_cambiar_estado', { p_id: r.id, p_estado: 'confirmada' })
  revisar(!conf.error && conf.data.estado === 'confirmada' && conf.data.vence === null, 'El dueño confirma la solicitud', conf.error?.message ?? conf.data?.estado)
  const anticipo = await dueno.rpc('hosp_registrar_pago', { p: { reservacion_id: r.id, monto: anticipoDebido, metodo: 'transferencia', referencia: solicitud.codigo } })
  revisar(!anticipo.error && anticipo.data.estado === 'confirmada' && anticipo.data.pagado === anticipoDebido, 'Registra el anticipo', anticipo.error?.message ?? anticipo.data)
  const resto = await dueno.rpc('hosp_registrar_pago', { p: { reservacion_id: r.id, monto: total - anticipoDebido, metodo: 'efectivo' } })
  revisar(!resto.error && resto.data.estado === 'pagada', 'Con el saldo cubierto queda «Pagada»', resto.error?.message ?? resto.data?.estado)
  const quitar = await dueno.rpc('hosp_borrar_pago', { p_id: resto.data.pagos.at(-1).id })
  revisar(!quitar.error && quitar.data.estado === 'confirmada', 'Si se quita un pago vuelve a «Confirmada»', quitar.error?.message ?? quitar.data?.estado)
  const { data: mia } = await web.rpc('consultar_reservacion', { p_token: solicitud.token })
  revisar(mia?.estado === 'confirmada' && mia.saldo === total - anticipoDebido && mia.pago?.monto === total - anticipoDebido && mia.puede_cancelar === false, 'El huésped ve su reservación confirmada y el saldo', mia)
  await espera(800)
  const correos2 = await fetch(`${URL_NUBE}/__correos`).then((x) => x.json())
  revisar(correos2.some((c) => c.para === 'huesped@prueba.mx' && c.asunto.includes('confirmada')), 'Sale el correo de confirmación al huésped', correos2.map((c) => c.asunto))
}

console.log('\n4. Reservación por teléfono, cancelación y apartados que vencen')
{
  const tel = await dueno.rpc('hosp_crear_reservacion', { p: { cabana_id: cabana.id, llegada: masDias(domingo, 10), salida: masDias(domingo, 12), huespedes: 2, nombre: 'Cliente por Teléfono', telefono: '3355556666', origen: 'telefono' } })
  revisar(!tel.error && tel.data.estado === 'confirmada' && tel.data.origen === 'telefono' && tel.data.total > 0, 'El dueño captura una reservación que llegó por teléfono', tel.error?.message ?? tel.data)
  const encima = await dueno.rpc('hosp_crear_reservacion', { p: { cabana_id: cabana.id, llegada: masDias(domingo, 11), salida: masDias(domingo, 13), huespedes: 2, nombre: 'Encimada' } })
  revisar(!!encima.error, 'El dueño tampoco puede empalmar reservaciones', encima.data)

  const otra = await reservar({ ...huesped, telefono: '3377778888', correo: '', llegada: masDias(domingo, 20), salida: masDias(domingo, 22) })
  revisar(otra.ok, 'La web crea otra solicitud', otra)
  const cancel = await web.rpc('cancelar_mi_reservacion', { p_token: otra.token })
  revisar(cancel.data?.estado === 'cancelada' && cancel.data?.motivo_cancelacion === 'huesped', 'El huésped cancela su solicitud desde su liga', cancel.data)
  const libre = await web.rpc('cotizar', { p_cabana: 'cabana-prueba', p_llegada: masDias(domingo, 20), p_salida: masDias(domingo, 22), p_huespedes: 2 })
  revisar(libre.data?.ok, 'Las fechas canceladas se liberan', libre.data)

  const vieja = await reservar({ ...huesped, telefono: '3344445555', llegada: masDias(domingo, 30), salida: masDias(domingo, 31) })
  // Se simula que pasaron las horas de apartado
  const { data: d1 } = await dueno.rpc('hosp_datos')
  const idVieja = d1.reservaciones.find((x) => x.codigo === vieja.codigo)?.id
  const venc = await fetch(`${URL_NUBE}/__vencer?id=${idVieja}`, { method: 'POST' }).then((x) => x.json())
  revisar(venc.ok, 'Se adelanta el vencimiento del apartado (solo en la nube local)', venc)
  const { data: d2 } = await dueno.rpc('hosp_datos')
  const r2 = d2.reservaciones.find((x) => x.codigo === vieja.codigo)
  revisar(r2?.estado === 'cancelada' && r2?.motivo_cancelacion === 'vencida', 'Una solicitud vencida se cancela sola y libera las fechas', r2)
}

console.log('\n5. Tiempo real')
{
  let llegó = false
  const canal = dueno.channel('hospedaje', { config: { private: true } }).on('broadcast', { event: 'cambio' }, () => (llegó = true))
  await new Promise((resolve) => canal.subscribe((s) => s === 'SUBSCRIBED' && resolve()))
  // Leer no es cambiar: si leer avisara «hubo cambios», la app se quedaría recargando sin parar
  for (let i = 0; i < 3; i++) await dueno.rpc('hosp_datos')
  await espera(500)
  revisar(!llegó, 'Leer los datos no avisa cambios (la app no se queda recargando)')
  await reservar({ ...huesped, telefono: '3366667777', llegada: masDias(domingo, 40), salida: masDias(domingo, 41) })
  for (let i = 0; i < 20 && !llegó; i++) await espera(100)
  revisar(llegó, 'La app de la Mac se entera al instante de la solicitud nueva')
  await dueno.removeChannel(canal)
}

console.log(`\n${pasos - fallas} de ${pasos} revisiones bien${fallas ? ` · ${fallas} fallaron` : ''}\n`)
cerrar()
process.exit(fallas ? 1 : 0)

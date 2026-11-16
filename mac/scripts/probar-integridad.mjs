// Casos de integridad con el SQL real, una nube aislada en memoria y pagos ficticios.
// Nunca usa credenciales ni datos del rancho. La concurrencia aquí es HTTP;
// PGlite serializa transacciones. La carrera de PostgreSQL se verifica aparte en producción.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const puerto = 54340
const base = `http://127.0.0.1:${puerto}`
const nube = spawn(process.execPath, [fileURLToPath(new URL('../nube-local/servidor.mjs', import.meta.url)), '--memoria'], { env: { ...process.env, NUBE_PORT: String(puerto) }, stdio: ['ignore', 'pipe', 'pipe'] })
let salida = ''
nube.stdout.on('data', d => { salida += d })
nube.stderr.on('data', d => { salida += d })
process.on('exit', () => nube.kill())
const casos = []
async function caso(nombre, fn) {
  try { await fn(); casos.push({ nombre, ok: true }); console.log(`✓ ${nombre}`) }
  catch (e) { casos.push({ nombre, ok: false, error: e.message }); console.error(`✗ ${nombre}: ${e.message}`) }
}
const cliente = createClient(base, 'sb_publishable_local', { auth: { persistSession: false, autoRefreshToken: false } })
async function rpc(fn, args) {
  const { data, error } = await cliente.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}
const dia = (fecha, n) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
let numero = 0
let hoy, cabana, otra
const datos = () => rpc('hosp_datos')
const detalle = id => rpc('hosp_reservacion', { p_id: id })
const crear = (desde, hasta, extra = {}) => rpc('hosp_crear_reservacion', { p: { cabana_id: cabana.id, llegada: dia(hoy, desde), salida: dia(hoy, hasta), huespedes: 2, nombre: `PRUEBA INTEGRIDAD ${++numero}`, ...extra } })
// Direcciones reservadas para documentación: simulan visitantes distintos SOLO en esta nube local.
const publico = (desde, hasta, extra = {}, ip = `192.0.2.${numero + 1}`) => fetch(`${base}/functions/v1/reservar`, { method: 'POST', headers: { apikey: 'sb_publishable_local', 'Content-Type': 'application/json', Origin: 'http://localhost:4321', 'X-Forwarded-For': ip }, body: JSON.stringify({ cabana: cabana.slug, llegada: dia(hoy, desde), salida: dia(hoy, hasta), huespedes: 2, nombre: 'PRUEBA INTEGRIDAD WEB', telefono: `33000${String(++numero).padStart(5, '0')}`, acepto: true, ...extra }) }).then(async r => ({ status: r.status, ...await r.json() }))
try {
  for (let i = 0; i < 120 && !salida.includes('lista en'); i++) {
    if (nube.exitCode !== null) throw new Error(salida)
    await new Promise(r => setTimeout(r, 100))
  }
  if (!salida.includes('lista en')) throw new Error('No arrancó la nube de prueba')
  const sesion = await cliente.auth.signInWithPassword({ email: 'dueno@lajoya.local', password: 'la-joya-local' })
  assert.ifError(sesion.error)
  hoy = (await datos()).hoy
  await rpc('hosp_guardar_ajustes', { p: { reservas_web: true, anticipo_pct: 50, horas_apartado: 24, dias_anticipacion: 365, correo_avisos: 'dueno@lajoya.local' } })
  cabana = await rpc('hosp_guardar_cabana', { p: { slug: 'integridad-a', nombre: 'PRUEBA A', capacidad: 4, precio_noche: 100, precio_fin_semana: 100, publicada: true } })
  otra = await rpc('hosp_guardar_cabana', { p: { slug: 'integridad-b', nombre: 'PRUEBA B', capacidad: 4, precio_noche: 100, precio_fin_semana: 100, publicada: true } })

  await caso('8 solicitudes simultáneas: una reserva, un código y un aviso al dueño', async () => {
    const antes = (await fetch(`${base}/__correos`).then(r => r.json())).length
    const respuestas = await Promise.all(Array.from({ length: 8 }, () => publico(20, 22)))
    assert.equal(respuestas.filter(r => r.ok).length, 1, JSON.stringify(respuestas))
    assert(respuestas.filter(r => !r.ok).every(r => r.status === 409))
    const todas = (await datos()).reservaciones.filter(r => r.llegada === dia(hoy, 20))
    assert.equal(todas.length, 1)
    let enviados = []
    for (let i = 0; i < 40; i++) {
      enviados = (await fetch(`${base}/__correos`).then(r => r.json())).slice(antes)
      if (enviados.length) break
      await new Promise(r => setTimeout(r, 25))
    }
    assert.equal(enviados.filter(a => a.para === 'dueno@lajoya.local').length, 1)
  })
  await caso('Reenviar exactamente lo mismo no crea otra reservación', async () => {
    const respuestas = await Promise.all(Array.from({ length: 4 }, () => publico(24, 26, { telefono: '3300011111' })))
    assert.equal(respuestas.filter(r => r.ok).length, 1, JSON.stringify(respuestas))
    assert.equal((await datos()).reservaciones.filter(r => r.llegada === dia(hoy, 24)).length, 1)
  })
  await caso('Reserva y cierre simultáneos no pueden ocupar las mismas noches', async () => {
    const resultados = await Promise.allSettled([crear(30, 32), rpc('hosp_guardar_bloqueo', { p: { cabana_id: cabana.id, inicio: dia(hoy, 30), fin: dia(hoy, 32), motivo: 'PRUEBA' } })])
    assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1)
    const d = await datos()
    assert.equal(d.reservaciones.filter(r => r.llegada === dia(hoy, 30)).length + d.bloqueos.filter(b => b.inicio === dia(hoy, 30)).length, 1)
  })
  await caso('Reservas consecutivas y otro hospedaje son válidos; el solapamiento no', async () => {
    await crear(40, 42)
    await crear(42, 44)
    await crear(40, 42, { cabana_id: otra.id })
    await assert.rejects(crear(41, 43))
    assert.equal((await datos()).reservaciones.filter(r => r.llegada >= dia(hoy, 40) && r.salida <= dia(hoy, 44)).length, 3)
  })
  await caso('Mover a fechas ocupadas falla sin alterar la reservación original', async () => {
    const r = await crear(50, 52)
    await crear(53, 55)
    await assert.rejects(rpc('hosp_actualizar_reservacion', { p_id: r.id, p: { llegada: dia(hoy, 54), salida: dia(hoy, 56) } }))
    const actual = await detalle(r.id)
    assert.equal(actual.llegada, r.llegada)
    assert.equal(actual.salida, r.salida)
    assert.equal(actual.total, r.total)
  })
  await caso('Cambiar hospedaje y noches recalcula el total sin duplicar el registro', async () => {
    const r = await crear(60, 62)
    const nuevo = await rpc('hosp_actualizar_reservacion', { p_id: r.id, p: { cabana_id: otra.id, salida: dia(hoy, 63) } })
    assert.equal(nuevo.id, r.id)
    assert.equal(nuevo.codigo, r.codigo)
    assert.equal(nuevo.cabana_id, otra.id)
    assert.equal(nuevo.total, 300)
    assert.equal((await datos()).reservaciones.filter(x => x.codigo === r.codigo).length, 1)
  })
  await caso('Pagos simultáneos distintos suman correctamente, sin perder abonos', async () => {
    const r = await crear(70, 72)
    await Promise.all([60, 140].map(monto => rpc('hosp_registrar_pago', { p: { reservacion_id: r.id, monto, metodo: 'efectivo' } })))
    const actual = await detalle(r.id)
    assert.equal(actual.pagos.length, 2)
    assert.equal(actual.pagado, 200)
    assert.equal(actual.estado, 'pagada')
    await rpc('hosp_borrar_pago', { p_id: actual.pagos[1].id })
    assert.equal((await detalle(r.id)).estado, 'confirmada')
  })
  await caso('Monto cero o negativo no crea pagos; al ampliar una pagada vuelve a saldo pendiente', async () => {
    const r = await crear(75, 77)
    for (const monto of [0, -10]) await assert.rejects(rpc('hosp_registrar_pago', { p: { reservacion_id: r.id, monto, metodo: 'efectivo' } }))
    assert.equal((await detalle(r.id)).pagos.length, 0)
    await rpc('hosp_registrar_pago', { p: { reservacion_id: r.id, monto: 200, metodo: 'efectivo' } })
    const ampliada = await rpc('hosp_actualizar_reservacion', { p_id: r.id, p: { salida: dia(hoy, 78) } })
    assert.equal(ampliada.total, 300)
    assert.equal(ampliada.pagado, 200)
    assert.equal(ampliada.estado, 'confirmada')
  })
  await caso('Confirmar repetidamente no duplica eventos ni correos', async () => {
    const p = await publico(80, 82)
    assert(p.ok, JSON.stringify(p))
    const r = (await datos()).reservaciones.find(r => r.codigo === p.codigo)
    await Promise.all(Array.from({ length: 4 }, () => rpc('hosp_cambiar_estado', { p_id: r.id, p_estado: 'confirmada' })))
    const actual = await detalle(r.id)
    assert.equal(actual.eventos.filter(e => e.detalle === 'Confirmada').length, 1)
  })
  await caso('Cancelar, ocupar con otra reserva e intentar reactivar no produce empalmes', async () => {
    const r = await crear(90, 92)
    await rpc('hosp_cambiar_estado', { p_id: r.id, p_estado: 'cancelada' })
    await crear(90, 92)
    await assert.rejects(rpc('hosp_cambiar_estado', { p_id: r.id, p_estado: 'confirmada' }))
    assert.equal((await detalle(r.id)).estado, 'cancelada')
  })
  await caso('Cancelar dos veces desde el huésped solo registra una cancelación', async () => {
    const p = await publico(100, 102)
    assert(p.ok, JSON.stringify(p))
    const resultados = await Promise.all(Array.from({ length: 2 }, () => rpc('cancelar_mi_reservacion', { p_token: p.token })))
    assert.equal(resultados.filter(x => x.ok).length, 1)
    assert.equal((await rpc('consultar_reservacion', { p_token: p.token })).estado, 'cancelada')
    const r = (await datos()).reservaciones.find(r => r.codigo === p.codigo)
    assert.equal((await detalle(r.id)).eventos.filter(e => /canceló el huésped/i.test(e.detalle)).length, 1)
  })
  await caso('Vencimiento libera fechas y la consulta no conserva estados viejos', async () => {
    const p = await publico(110, 112)
    assert(p.ok, JSON.stringify(p))
    const r = (await datos()).reservaciones.find(r => r.codigo === p.codigo)
    await fetch(`${base}/__vencer?id=${r.id}`, { method: 'POST' })
    const mia = await rpc('consultar_reservacion', { p_token: p.token })
    assert.equal(mia.estado, 'cancelada')
    assert.equal(mia.motivo_cancelacion, 'vencida')
    assert((await publico(110, 112)).ok)
  })
  await caso('Fechas inválidas y capacidad excesiva no dejan registros parciales', async () => {
    const antes = (await datos()).reservaciones.length
    for (const [desde, hasta, extra] of [[120, 120, {}], [123, 122, {}], [-2, -1, {}], [120, 122, { huespedes: 99 }]]) {
      assert.equal((await publico(desde, hasta, extra)).ok, false)
    }
    assert.equal((await datos()).reservaciones.length, antes)
  })
  await caso('El límite de 8 intentos por IP frena el noveno sin crear reservas', async () => {
    const antes = (await datos()).reservaciones.length
    for (let i = 0; i < 8; i++) assert.equal((await publico(140, 142, { huespedes: 99 }, '198.51.100.1')).motivo, 'capacidad')
    assert.equal((await publico(140, 142, {}, '198.51.100.1')).status, 429)
    assert.equal((await datos()).reservaciones.length, antes)
  })
  await caso('Avisos de una reserva no se duplican al consultar varias veces', async () => {
    const antes = (await fetch(`${base}/__correos`).then(r => r.json())).length
    await Promise.all(Array.from({ length: 6 }, () => datos()))
    const despues = (await fetch(`${base}/__correos`).then(r => r.json())).length
    assert.equal(despues, antes)
  })
  const informe = { entorno: 'PGlite aislado, SQL real', casos, aprobados: casos.filter(c => c.ok).length, total: casos.length }
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(informe, null, 2))
  console.log(`\n${informe.aprobados}/${informe.total} grupos de integridad correctos`)
  process.exitCode = casos.some(c => !c.ok) ? 1 : 0
} finally { await cliente.auth.signOut(); nube.kill() }

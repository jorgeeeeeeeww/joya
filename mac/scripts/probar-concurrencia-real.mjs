// Prueba acotada y explícita del servicio real: 6 envíos como máximo.
// Crea solo solicitudes ficticias SIN pagos y las cancela por su token en finally.
// No modifica configuración, cuentas, otras reservaciones ni datos de hospedajes.
import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

if (!process.argv.includes('--confirmar-produccion')) throw new Error('Esta prueba escribe solicitudes reales: falta --confirmar-produccion')
const base = process.env.PRUEBA_SUPABASE_URL?.replace(/\/$/, '')
const key = process.env.PRUEBA_SUPABASE_PUBLICA
assert(base?.startsWith('https://') && key, 'Faltan la URL y llave pública del destino autorizado')
const headers = { apikey: key, 'Content-Type': 'application/json', Origin: 'https://jardineslajoya.com' }
const archivo = fileURLToPath(new URL('../nube-local/concurrencia-recuperacion.local', import.meta.url))
const creadas = []
const resultados = []
const sumar = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
async function rpc(fn, p) {
  const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(p), signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`${fn}: HTTP ${r.status}`)
  return r.json()
}
async function reservar(cuerpo) {
  // No se inyectan IPs, ni se elude el límite del servicio real.
  const r = await fetch(`${base}/functions/v1/reservar`, { method: 'POST', headers, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(30000) })
  const datos = await r.json()
  if (datos.ok) {
    creadas.push({ codigo: datos.codigo, token: datos.token, cabana: cuerpo.cabana, llegada: cuerpo.llegada, salida: cuerpo.salida })
    await writeFile(archivo, JSON.stringify(creadas, null, 2))
  }
  return { status: r.status, datos }
}
async function verificar(nombre, fn) {
  await fn()
  resultados.push({ nombre, ok: true })
  console.log(`✓ ${nombre}`)
}
let error
try {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
  const ajustes = await rpc('ajustes_publicos', {})
  assert.equal(ajustes.reservas_web, true, 'Las solicitudes web no están habilitadas; no se modificará el ajuste')
  const cabs = (await rpc('cabanas_publicas', {})).filter(c => c.tipo === 'cabana' && c.capacidad >= 2 && c.reservable)
  assert(cabs.length >= 2, 'Se necesitan dos hospedajes publicados para comparar ocupación independiente')
  const noches = Math.max(2, ajustes.noches_minimas || 1)
  assert(noches <= 7, 'La estancia mínima supera el límite de esta prueba acotada')
  let llegada
  for (let i = 0; i < 8; i++) {
    const fecha = sumar(hoy, 60 + i * 10)
    if (sumar(fecha, noches * 2) > ajustes.fecha_maxima) break
    const q1 = await rpc('cotizar', { p_cabana: cabs[0].slug, p_llegada: fecha, p_salida: sumar(fecha, noches * 2), p_huespedes: 2 })
    const q2 = await rpc('cotizar', { p_cabana: cabs[1].slug, p_llegada: fecha, p_salida: sumar(fecha, noches), p_huespedes: 2 })
    if (q1.ok && q2.ok) { llegada = fecha; break }
  }
  assert(llegada, 'No se encontró un intervalo libre; no se crearon solicitudes')
  const cuerpo = { cabana: cabs[0].slug, llegada, salida: sumar(llegada, noches), huespedes: 2, nombre: `PRUEBA CONCURRENCIA ${Date.now()} NO HOSPEDAR`, telefono: '3300000000', comentarios: 'SIMULACION TECNICA autorizada por Jorge. Sin huesped real ni pago. Se cancela al finalizar.', acepto: true }
  const respuestas = await Promise.allSettled(Array.from({ length: 3 }, () => reservar(cuerpo)))
  const completas = respuestas.filter(r => r.status === 'fulfilled').map(r => r.value)
  await verificar('Tres envíos simultáneos idénticos: un éxito y dos rechazos por ocupación', async () => {
    assert.equal(completas.length, 3)
    assert.equal(completas.filter(r => r.datos.ok).length, 1, JSON.stringify(completas.map(r => ({ status: r.status, motivo: r.datos.motivo }))))
    assert.equal(completas.filter(r => r.status === 409 && r.datos.motivo === 'no_disponible').length, 2)
  })
  const primera = creadas[0]
  await verificar('Reenvío después de guardar: no aparece un segundo código', async () => {
    const repetida = await reservar(cuerpo)
    assert.equal(repetida.status, 409)
    assert.equal(repetida.datos.motivo, 'no_disponible')
    assert.equal(creadas.length, 1)
  })
  await verificar('Salida y siguiente llegada el mismo día: dos reservas válidas sin empalme', async () => {
    const adyacente = await reservar({ ...cuerpo, nombre: cuerpo.nombre + ' CONSECUTIVA', llegada: cuerpo.salida, salida: sumar(cuerpo.salida, noches) })
    assert(adyacente.datos.ok, `HTTP ${adyacente.status}: ${adyacente.datos.motivo}`)
    assert.notEqual(adyacente.datos.codigo, primera.codigo)
  })
  await verificar('Otro hospedaje admite las mismas fechas sin bloquearlo indebidamente', async () => {
    const otra = await reservar({ ...cuerpo, nombre: cuerpo.nombre + ' OTRA CABANA', cabana: cabs[1].slug })
    assert(otra.datos.ok, `HTTP ${otra.status}: ${otra.datos.motivo}`)
  })
  await verificar('Consulta privada coincide y no hay pagos en las solicitudes técnicas', async () => {
    for (const r of creadas) {
      const mia = await rpc('consultar_reservacion', { p_token: r.token })
      assert.equal(mia.estado, 'solicitud')
      assert.equal(mia.pagado, 0)
      assert.equal(mia.codigo, r.codigo)
      assert.equal(mia.llegada, r.llegada)
      assert.equal(mia.salida, r.salida)
    }
  })
} catch (e) {
  error = e.message
  console.error(`✗ ${error}`)
} finally {
  // Intenta limpiar TODAS las creadas aunque una cancelación falle.
  for (const r of creadas) {
    try {
      const cancelada = await rpc('cancelar_mi_reservacion', { p_token: r.token })
      const actual = cancelada.ok ? cancelada : await rpc('consultar_reservacion', { p_token: r.token })
      assert.equal(actual.estado, 'cancelada')
      assert.equal(actual.pagado, 0)
      const q = await rpc('cotizar', { p_cabana: r.cabana, p_llegada: r.llegada, p_salida: r.salida, p_huespedes: 2 })
      assert(q.ok, 'Las noches no aparecen disponibles después de cancelar')
      r.limpia = true
      resultados.push({ nombre: `Cancelación y fechas libres: ${r.codigo}`, ok: true })
      console.log(`✓ ${r.codigo}: cancelada, pagado $0, fechas libres`)
    } catch (e) { error = [error, `No terminó la limpieza ${r.codigo}: ${e.message}`].filter(Boolean).join('; ') }
  }
  if (creadas.every(r => r.limpia)) await unlink(archivo).catch(() => {})
  const informe = { fecha: new Date().toISOString(), entorno: 'Supabase real, solo API pública, máximo seis envíos', resultados, creadas: creadas.map(({ token, ...r }) => r), error: error || null }
  await writeFile(fileURLToPath(new URL('../../docs/prueba-final-2026-11-15/concurrencia-real.json', import.meta.url)), JSON.stringify(informe, null, 2))
  process.exitCode = error ? 1 : 0
}

// Llena la nube local con un escenario de prueba: solicitudes hechas como las haría la web (contrato
// /functions/v1/reservar) y reservaciones capturadas por el dueño. Solo para la nube local.
const URL = 'http://127.0.0.1:54331'
const LLAVE = 'sb_publishable_local'

const json = (r) => r.json()
async function rpc(fn, args, token) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: LLAVE, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(args ?? {}) })
  const j = await r.json()
  if (!r.ok) throw new Error(`${fn}: ${j.message}`)
  return j
}
const reservar = (datos) => fetch(`${URL}/functions/v1/reservar`, { method: 'POST', headers: { apikey: LLAVE, 'Content-Type': 'application/json', Origin: 'http://localhost:4321' }, body: JSON.stringify(datos) }).then(async (r) => ({ status: r.status, ...(await r.json()) }))
const masDias = (f, n) => {
  const d = new Date(f + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const ses = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: LLAVE, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dueno@lajoya.local', password: 'la-joya-local' }) }).then(json)
const tok = ses.access_token
const datos = await rpc('hosp_datos', {}, tok)
if (datos.reservaciones.length) {
  console.log('Ya hay reservaciones; no se agrega nada.')
  process.exit(0)
}
const hoy = datos.hoy
const cab = Object.fromEntries(datos.cabanas.map((c) => [c.slug, c]))
const A = cab['cabana-de-prueba-a']
const B = cab['cabana-de-prueba-b']
const casa = cab['casa-de-prueba']
const hab = cab['habitacion-de-prueba']

// Políticas y aviso de prueba para que la web pueda reservar
await rpc('hosp_guardar_ajustes', { p: { politicas: 'Texto de políticas de prueba (lo escribe el rancho).', aviso_privacidad: 'Aviso de privacidad de prueba (lo escribe el rancho).', telefono_hospedaje: '3300000000', telefono_salon: '3311111111', horas_apartado: 24 } }, tok)

// 1) Como la web: solicitudes nuevas con el contrato
let viernes = masDias(hoy, 1)
while (new Date(viernes + 'T12:00:00Z').getUTCDay() !== 5) viernes = masDias(viernes, 1)
const web1 = await reservar({ cabana: hab.slug, llegada: hoy, salida: masDias(hoy, 1), huespedes: 2, nombre: 'Lucía Méndez', telefono: '33 1234 5601', correo: 'lucia@prueba.mx', hora_llegada: '19:00', comentarios: 'Llegamos después del trabajo', acepto: true })
const web2 = await reservar({ cabana: B.slug, llegada: viernes, salida: masDias(viernes, 2), huespedes: 2, nombre: 'Carlos Ruiz', telefono: '33 1234 5602', correo: 'carlos@prueba.mx', acepto: true })
const web3 = await reservar({ cabana: A.slug, llegada: masDias(hoy, 20), salida: masDias(hoy, 23), huespedes: 4, nombre: 'Familia Ortega', telefono: '33 1234 5603', acepto: true })
for (const w of [web1, web2, web3]) console.log(w.status, w.codigo ?? w.mensaje)

// 2) Como el dueño: reservaciones por teléfono y WhatsApp, con pagos
const crear = (p) => rpc('hosp_crear_reservacion', { p }, tok)
const pagar = (id, monto, metodo = 'transferencia') => rpc('hosp_registrar_pago', { p: { reservacion_id: id, monto, metodo } }, tok)
const r1 = await crear({ cabana_id: A.id, llegada: masDias(hoy, -1), salida: masDias(hoy, 2), huespedes: 3, nombre: 'Mariana López', telefono: '3312345604', origen: 'whatsapp' })
await pagar(r1.id, r1.anticipo)
const r2 = await crear({ cabana_id: casa.id, llegada: hoy, salida: masDias(hoy, 3), huespedes: 5, nombre: 'Familia Hernández', telefono: '3312345605', origen: 'telefono', hora_llegada: '16:00' })
await pagar(r2.id, r2.total)
const r3 = await crear({ cabana_id: B.id, llegada: masDias(hoy, -2), salida: hoy, huespedes: 2, nombre: 'Roberto Gómez', telefono: '3312345606', origen: 'directo' })
await pagar(r3.id, r3.anticipo)
const r4 = await crear({ cabana_id: casa.id, llegada: masDias(hoy, 12), salida: masDias(hoy, 15), huespedes: 6, nombre: 'Andrea Salas', telefono: '3312345607', origen: 'whatsapp' })
await pagar(r4.id, r4.anticipo)
await crear({ cabana_id: hab.id, llegada: masDias(hoy, 3), salida: masDias(hoy, 5), huespedes: 2, nombre: 'Pablo Navarro', telefono: '3312345608', origen: 'telefono' })
await rpc('hosp_guardar_bloqueo', { p: { cabana_id: B.id, inicio: masDias(hoy, 10), fin: masDias(hoy, 12), motivo: 'Mantenimiento' } }, tok)
await rpc('hosp_guardar_temporada', { p: { cabana_id: A.id, nombre: 'Temporada de prueba', desde: masDias(hoy, 45), hasta: masDias(hoy, 52), precio_noche: 1500, noches_minimas: 2 } }, tok)

const fin = await rpc('hosp_datos', {}, tok)
console.log(`Listo: ${fin.reservaciones.length} reservaciones, ${fin.reservaciones.filter((r) => r.estado === 'solicitud').length} solicitudes`)

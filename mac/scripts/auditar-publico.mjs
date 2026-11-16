// Auditoría de acceso anónimo, solo lecturas y UUID inexistente. No crea reservaciones.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
const base = process.env.PRUEBA_SUPABASE_URL?.replace(/\/$/, '')
const key = process.env.PRUEBA_SUPABASE_PUBLICA
assert(base && key, 'Faltan URL y llave pública de auditoría')
const headers = { apikey: key, 'Content-Type': 'application/json', Origin: 'https://jardineslajoya.com' }
const casos = []
const id = '00000000-0000-4000-a000-000000000000'
async function comprobar(nombre, hacer) {
  try { await hacer(); casos.push({ nombre, ok: true }); console.log(`✓ ${nombre}`) }
  catch (e) { casos.push({ nombre, ok: false, error: e.message }); console.log(`✗ ${nombre}: ${e.message}`) }
}
for (const [fn, cuerpo] of [['hosp_datos', {}], ['hosp_buscar', { p_texto: 'PRUEBA' }], ['hosp_reservacion', { p_id: id }], ['hosp_reservacion_json', { p_id: id }], ['hosp_precio', { p_cabana: id, p_llegada: '2027-01-01', p_salida: '2027-01-02', p_huespedes: 1 }]]) {
  await comprobar(`Sin sesión no se ejecuta ${fn}`, async () => {
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(cuerpo) })
    assert([401, 403].includes(r.status), `Se esperaba rechazo; HTTP ${r.status}`)
  })
}
for (const tabla of ['reservaciones', 'pagos', 'profiles', 'hospedaje_avisos']) {
  await comprobar(`Sin sesión no se leen filas de ${tabla}`, async () => {
    const r = await fetch(`${base}/rest/v1/${tabla}?select=*&limit=0`, { headers })
    if ([401, 403].includes(r.status)) return
    assert(r.ok, `HTTP inesperado ${r.status}`)
    // RLS también puede ocultar las filas con una respuesta vacía.
    const lectura = await fetch(`${base}/rest/v1/${tabla}?select=*&limit=1`, { headers })
    assert.deepEqual(await lectura.json(), [], 'La tabla revela filas a un visitante anónimo')
  })
}
await comprobar('Los ajustes públicos no incluyen correo del dueño ni credenciales', async () => {
  const r = await fetch(`${base}/rest/v1/rpc/ajustes_publicos`, { method: 'POST', headers, body: '{}' })
  assert(r.ok)
  const data = await r.json()
  for (const campo of ['correo_avisos', 'clabe', 'titular', 'password', 'service_role_key']) assert(!(campo in data), `Se expone ${campo}`)
})
await comprobar('Un token inexistente no expone una reservación', async () => {
  const r = await fetch(`${base}/rest/v1/rpc/consultar_reservacion`, { method: 'POST', headers, body: JSON.stringify({ p_token: id }) })
  const data = await r.json()
  assert.equal(data.ok, false)
  assert.equal(data.motivo, 'no_existe')
  assert(!data.nombre && !data.telefono && !data.token)
})
await writeFile('../docs/prueba-final-2026-11-15/permisos-reales.json', JSON.stringify({ fecha: new Date().toISOString(), casos }, null, 2))
process.exitCode = casos.some(c => !c.ok) ? 1 : 0

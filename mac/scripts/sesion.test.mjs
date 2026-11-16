// Ejecuta el store real. Solo reemplaza los límites de red, sistema operativo y avisos.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'vite'
import { fileURLToPath } from 'node:url'
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const memoria = new Map()
globalThis.localStorage = { getItem: k => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v), removeItem: k => memoria.delete(k) }
globalThis.location = { search: '' }
const avisos = []
globalThis.__auditoriaAviso = (...args) => avisos.push(args)
const salida = await build({
  configFile: false, logLevel: 'silent',
  plugins: [{
    name: 'limites-del-store', enforce: 'pre',
    resolveId(id, importer) {
      if (/\/src\/lib\/(store|acciones)\.ts$/.test(importer?.replaceAll('\\', '/') ?? '') && ['./nube', './mac', './sonido', '@/components/ui'].includes(id)) return '\0auditoria:' + id
      for (const [sufijo, nombre] of [['/src/lib/nube.ts', './nube'], ['/src/lib/mac.ts', './mac'], ['/src/lib/sonido.ts', './sonido'], ['/src/components/ui.tsx', '@/components/ui']]) {
        if (id.replaceAll('\\', '/').endsWith(sufijo)) return '\0auditoria:' + nombre
      }
    },
    load(id) {
      if (id === '\0auditoria:./nube') return 'export const nube={auth:{signOut:async()=>{globalThis.__cierresSesion++;return {error:null}}}};export const rpc=(...args)=>globalThis.__auditoriaRPC(...args)'
      if (id === '\0auditoria:./mac') return 'export const avisosPermitidos=async()=>false;export const ponerInsignia=(...a)=>globalThis.__auditoriaAviso(...a);export const avisar=async()=>{}'
      if (id === '\0auditoria:./sonido') return 'export const sonarAviso=async()=>{}'
      if (id === '\0auditoria:@/components/ui') return 'export const toast={error:(...a)=>globalThis.__auditoriaAviso(...a),action:()=>{}}'
    },
  }],
  build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./fixtures/store-auditoria.ts', import.meta.url)), formats: ['es'] } },
})
const paquete = (Array.isArray(salida) ? salida : [salida]).flatMap(s => s.output).find(x => x.type === 'chunk' && x.isEntry)
const temporal = await mkdtemp(join(tmpdir(), 'joya-auditoria-'))
const modulo = join(temporal, 'store.mjs')
await writeFile(modulo, paquete.code)
const { useApp, moverReservacion, moverCierre, borrarCierre } = await import(pathToFileURL(modulo).href)
await unlink(modulo)
await rmdir(temporal)
const sesion = id => ({ user: { id }, access_token: `token-${id}` })
const datos = marca => ({ hoy: '2026-11-15', ahora: marca, cabanas: [], reservaciones: [], ajustes: {}, bloqueos: [], temporadas: [] })
const pendiente = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function limpiar() { useApp.getState().ponerSesion(null); memoria.clear(); avisos.length = 0; globalThis.__cierresSesion = 0 }

test('un error de token no cierra la sesión ni borra los datos recuperables', async () => {
  limpiar()
  useApp.getState().ponerSesion(sesion('A'))
  globalThis.__auditoriaRPC = async () => datos('A')
  await useApp.getState().cargar()
  globalThis.__auditoriaRPC = async () => { throw Object.assign(new Error('Tu sesión venció. Vuelve a entrar.'), { code: 'PGRST301' }) }
  await useApp.getState().cargar()
  assert.equal(globalThis.__cierresSesion, 0)
  assert.equal(useApp.getState().sesion.user.id, 'A')
  assert.equal(useApp.getState().datos.ahora, 'A')
  assert.equal(useApp.getState().conexion, 'sin-conexion')
})

test('la cuenta B no muestra la copia guardada por A y una copia antigua sin dueño se descarta', () => {
  limpiar()
  memoria.set('la-joya-mac:datos', JSON.stringify({ usuario: 'A', datos: datos('privados A') }))
  useApp.getState().ponerSesion(sesion('B'))
  assert.equal(useApp.getState().datos, null)
  useApp.getState().ponerSesion(null)
  memoria.set('la-joya-mac:datos', JSON.stringify(datos('formato antiguo')))
  useApp.getState().ponerSesion(sesion('A'))
  assert.equal(useApp.getState().datos, null)
})
test('una carga que termina después de salir no repone datos, caché ni avisos', async () => {
  limpiar()
  const red = pendiente()
  globalThis.__auditoriaRPC = () => red.promise
  useApp.getState().ponerSesion(sesion('A'))
  const carga = useApp.getState().cargar()
  await useApp.getState().salir()
  const numeroAvisos = avisos.length
  red.resolve(datos('respuesta tardía de A'))
  await carga
  assert.equal(useApp.getState().datos, null)
  assert.equal(memoria.has('la-joya-mac:datos'), false)
  assert.equal(avisos.length, numeroAvisos)
})
test('la respuesta de A no reemplaza la de B ni libera la carga pendiente de B', async () => {
  limpiar()
  const a = pendiente(), b = pendiente()
  let llamadas = 0
  globalThis.__auditoriaRPC = () => (++llamadas === 1 ? a.promise : b.promise)
  useApp.getState().ponerSesion(sesion('A'))
  const cargaA = useApp.getState().cargar()
  useApp.getState().ponerSesion(sesion('B'))
  const cargaB = useApp.getState().cargar()
  a.resolve(datos('A'))
  await cargaA
  assert.equal(useApp.getState().datos, null)
  assert.equal(useApp.getState().cargar(), cargaB)
  b.resolve(datos('B'))
  await cargaB
  assert.equal(useApp.getState().datos.ahora, 'B')
  assert.equal(JSON.parse(memoria.get('la-joya-mac:datos')).usuario, 'B')
})
test('un error tardío de otra sesión no cambia la conexión de la cuenta actual', async () => {
  limpiar()
  const a = pendiente()
  globalThis.__auditoriaRPC = () => a.promise
  useApp.getState().ponerSesion(sesion('A'))
  const cargaA = useApp.getState().cargar()
  useApp.getState().ponerSesion(sesion('B'))
  globalThis.__auditoriaRPC = async () => datos('B')
  await useApp.getState().cargar()
  a.reject(Object.assign(new Error('sin permiso'), { code: '42501' }))
  await cargaA
  assert.equal(useApp.getState().conexion, 'en-linea')
  assert.equal(useApp.getState().sinPermiso, false)
  assert.equal(useApp.getState().datos.ahora, 'B')
})
test('revocar permisos borra datos privados y renovar el token de la misma cuenta los conserva', async () => {
  limpiar()
  useApp.getState().ponerSesion(sesion('A'))
  globalThis.__auditoriaRPC = async () => datos('A')
  await useApp.getState().cargar()
  const antes = useApp.getState().datos
  useApp.getState().ponerSesion({ ...sesion('A'), access_token: 'renovado' })
  assert.equal(useApp.getState().datos, antes)
  globalThis.__auditoriaRPC = async () => { throw Object.assign(new Error('sin permiso'), { code: '42501' }) }
  await useApp.getState().cargar()
  assert.equal(useApp.getState().datos, null)
  assert.equal(useApp.getState().sinPermiso, true)
  assert.equal(memoria.has('la-joya-mac:datos'), false)
})
function prepararSinRed() {
  limpiar()
  useApp.getState().ponerSesion(sesion('A'))
  const reserva = { id: 'r1', cabana_id: 'c1', llegada: '2026-12-01', salida: '2026-12-03', total: 200, nombre: 'PRUEBA' }
  const cierre = { id: 'b1', cabana_id: 'c1', inicio: '2026-12-10', fin: '2026-12-12', motivo: 'PRUEBA' }
  useApp.setState({ conexion: 'en-linea', datos: { ...datos('A'), reservaciones: [reserva], bloqueos: [cierre] } })
  globalThis.__auditoriaRPC = async () => { throw new Error('red interrumpida') }
  return { reserva, cierre }
}
test('un movimiento rechazado vuelve a las fechas anteriores aunque la recarga también falle', async () => {
  const { reserva } = prepararSinRed()
  assert.equal(await moverReservacion(reserva, { llegada: '2026-12-05', salida: '2026-12-07' }), null)
  assert.equal(useApp.getState().datos.reservaciones[0].llegada, reserva.llegada)
  assert.equal(useApp.getState().datos.reservaciones[0].salida, reserva.salida)
})
test('un cierre que no se pudo mover no conserva fechas provisionales', async () => {
  const { cierre } = prepararSinRed()
  assert.equal(await moverCierre(cierre, { inicio: '2026-12-20', fin: '2026-12-22' }), null)
  assert.equal(useApp.getState().datos.bloqueos[0].inicio, cierre.inicio)
})
test('un cierre que no se pudo abrir sigue bloqueando visualmente esas fechas', async () => {
  const { cierre } = prepararSinRed()
  assert.equal(await borrarCierre(cierre), null)
  assert.deepEqual(useApp.getState().datos.bloqueos, [cierre])
})
test('un fallo al abrir un cierre de A no inserta ese cierre en la sesión B', async () => {
  const { cierre } = prepararSinRed()
  const red = pendiente()
  globalThis.__auditoriaRPC = () => red.promise
  const operacion = borrarCierre(cierre)
  // Deja comenzar la operación de A antes de cambiar de cuenta.
  await Promise.resolve()
  useApp.getState().ponerSesion(sesion('B'))
  useApp.setState({ datos: datos('B') })
  globalThis.__auditoriaRPC = async () => { throw new Error('red interrumpida') }
  red.reject(new Error('red interrumpida'))
  await operacion
  assert.deepEqual(useApp.getState().datos.bloqueos, [])
})

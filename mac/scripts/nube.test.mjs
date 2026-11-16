import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'vite'
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

globalThis.location = { search: '' }
globalThis.window = { __TAURI_INTERNALS__: {} }
let usuario = 'A', llamadas = 0, renovaciones = 0, fondo = 0
const session = () => usuario ? { user: { id: usuario } } : null
let responder
globalThis.__nubePrueba = {
  auth: {
    startAutoRefresh: async () => { fondo++ },
    getSession: async () => ({ data: { session: session() }, error: null }),
    refreshSession: async () => { renovaciones++; return { data: { session: session() }, error: null } },
  },
  rpc: async () => { llamadas++; return responder() },
}
const resultado = await build({
  configFile: false, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
  plugins: [{
    name: 'nube-sin-red', enforce: 'pre',
    resolveId(id) { if (id === '@supabase/supabase-js') return '\0nube-prueba' },
    load(id) { if (id === '\0nube-prueba') return 'export const createClient=()=>globalThis.__nubePrueba' },
  }],
  build: { write: false, target: 'node24', lib: { entry: fileURLToPath(new URL('../src/lib/nube.ts', import.meta.url)), formats: ['es'] }, rollupOptions: { external: ['@tauri-apps/plugin-http'] } },
})
const entrada = (Array.isArray(resultado) ? resultado : [resultado]).flatMap(x => x.output).find(x => x.type === 'chunk' && x.isEntry)
const temporal = await mkdtemp(join(tmpdir(), 'joya-nube-'))
const archivo = join(temporal, 'nube.mjs')
await writeFile(archivo, entrada.code)
const { rpc } = await import(pathToFileURL(archivo).href)
await unlink(archivo)
await rmdir(temporal)
const caducado = { data: null, error: { code: 'PGRST303', message: 'JWT expired' } }
const limpiar = () => { usuario = 'A'; llamadas = 0; renovaciones = 0 }

test('la app de escritorio renueva también con la ventana oculta', () => assert.equal(fondo, 1))
test('token caducado: renueva y recupera la consulta sin pedir contraseña', async () => {
  limpiar()
  responder = () => llamadas === 1 ? caducado : { data: { ok: true }, error: null }
  assert.deepEqual(await rpc('hosp_datos'), { ok: true })
  assert.equal(llamadas, 2)
  assert.equal(renovaciones, 1)
})
test('un token rechazado de nuevo no produce un bucle de peticiones', async () => {
  limpiar()
  responder = () => caducado
  await assert.rejects(rpc('hosp_datos'))
  assert.equal(llamadas, 2)
  assert.equal(renovaciones, 1)
})
test('un fallo de red en una escritura no repite la operación', async () => {
  limpiar()
  responder = () => { throw new Error('network failed') }
  await assert.rejects(rpc('hosp_reservar'))
  assert.equal(llamadas, 1)
  assert.equal(renovaciones, 0)
})
test('cambiar de cuenta durante una petición impide repetirla con la cuenta nueva', async () => {
  limpiar()
  responder = () => { usuario = 'B'; return caducado }
  await assert.rejects(rpc('hosp_reservar'))
  assert.equal(llamadas, 1)
  assert.equal(renovaciones, 0)
})

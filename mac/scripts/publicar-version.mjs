// Publica una versión nueva de la app en Supabase Storage (almacén «versiones»). La app instalada revisa
// latest.json y, si encuentra una versión más nueva, la baja y comprueba su firma antes de instalarla.
//
// Solo publica si el número de mac/package.json es mayor que el ya publicado: para sacar una versión
// basta subir ese número. Sube primero los archivos y al final latest.json, para que nunca anuncie algo
// que todavía no está. Conserva la versión actual y la anterior; las demás se borran para no llenar el almacén.
//
//   SUPABASE_URL=… SB_SECRET_KEY=… node scripts/publicar-version.mjs <carpeta con los archivos de la compilación>
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ALMACEN = 'versiones'
const AQUI = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(await readFile(join(AQUI, '..', 'package.json'), 'utf8'))
const URL_NUBE = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const LLAVE = process.env.SB_SECRET_KEY
const CARPETA = process.argv[2]

if (!URL_NUBE || !LLAVE || !CARPETA) {
  console.error('Faltan SUPABASE_URL, SB_SECRET_KEY o la carpeta con los archivos de la compilación.')
  process.exit(1)
}

const nube = createClient(URL_NUBE, LLAVE, { auth: { persistSession: false, autoRefreshToken: false } })
const almacen = nube.storage.from(ALMACEN)
const publica = (ruta) => `${URL_NUBE}/storage/v1/object/public/${ALMACEN}/${ruta}`

/** -1, 0 o 1, comparando número por número (0.9.0 es menor que 0.10.0) */
function comparar(a, b) {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1
  return 0
}

async function publicada() {
  const r = await fetch(`${publica('latest.json')}?t=${Date.now()}`)
  if (!r.ok) return null
  return (await r.json()).version ?? null
}

async function subir(ruta, datos, contentType, cacheControl = '31536000') {
  const { error } = await almacen.upload(ruta, datos, { contentType, cacheControl, upsert: true })
  if (error) throw new Error(`No se pudo subir ${ruta}: ${error.message}`)
  console.log(`  subido ${ruta} (${(datos.length / 1048576).toFixed(1)} MB)`)
}

const actual = await publicada()
if (actual && comparar(version, actual) <= 0) {
  console.log(`La versión ${version} no es más nueva que la publicada (${actual}): no se publica nada. Para sacar una versión, sube el número en mac/package.json.`)
  process.exit(0)
}

// Los archivos llegan en subcarpetas, según cómo los guardó cada compilación
const archivos = (await readdir(CARPETA, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name))
const buscar = (fin) => archivos.find((a) => a.endsWith(fin))
const macApp = buscar('.app.tar.gz')
const macFirma = buscar('.app.tar.gz.sig')
const dmg = buscar('.dmg')
const winApp = buscar('-setup.exe')
const winFirma = buscar('-setup.exe.sig')
if (!macApp || !macFirma || !dmg) {
  console.error(`Faltan archivos de la Mac (¿se compiló con el secreto TAURI_SIGNING_PRIVATE_KEY?). Encontré:\n${archivos.join('\n')}`)
  process.exit(1)
}

console.log(`Publicando la versión ${version} (antes: ${actual ?? 'ninguna'})`)
const plataformas = {}
const rutaMac = `${version}/La-Joya-universal.app.tar.gz`
await subir(rutaMac, await readFile(macApp), 'application/gzip')
const entradaMac = { signature: (await readFile(macFirma, 'utf8')).trim(), url: publica(rutaMac) }
// Un solo archivo universal sirve para los dos tipos de Mac
plataformas['darwin-aarch64'] = entradaMac
plataformas['darwin-x86_64'] = entradaMac
if (winApp && winFirma) {
  const rutaWin = `${version}/La-Joya-setup.exe`
  await subir(rutaWin, await readFile(winApp), 'application/octet-stream')
  plataformas['windows-x86_64'] = { signature: (await readFile(winFirma, 'utf8')).trim(), url: publica(rutaWin) }
}
// Una liga fija para instalar por primera vez, sin entrar a GitHub
await subir('La-Joya.dmg', await readFile(dmg), 'application/x-apple-diskimage', '300')

const anuncio = { version, notes: `Versión ${version}`, pub_date: new Date().toISOString(), platforms: plataformas }
await subir('latest.json', Buffer.from(JSON.stringify(anuncio, null, 2)), 'application/json', '60')

// Limpieza: si algo falla aquí la versión ya quedó publicada, así que solo se avisa
try {
  const { data: raiz, error } = await almacen.list('', { limit: 100 })
  if (error) throw new Error(error.message)
  const viejas = raiz.map((e) => e.name).filter((n) => /^\d+\.\d+\.\d+$/.test(n) && n !== version && n !== actual)
  for (const vieja of viejas) {
    const { data: dentro, error: e2 } = await almacen.list(vieja, { limit: 100 })
    if (e2) throw new Error(e2.message)
    const { error: e3 } = await almacen.remove(dentro.map((f) => `${vieja}/${f.name}`))
    if (e3) throw new Error(e3.message)
    console.log(`  borrada la versión ${vieja}`)
  }
} catch (e) {
  console.warn(`::warning::La versión ${version} se publicó, pero no se pudieron borrar las viejas: ${e instanceof Error ? e.message : e}`)
}
console.log(`Listo: ${publica('latest.json')}`)

// Prueba en pantalla con los 12 hospedajes reales: levanta una nube en memoria con esos nombres,
// la web (http://localhost:4325) y la app de la Mac (http://127.0.0.1:5182), las dos conectadas a ella.
// No toca la nube local de siempre (54331) ni sus datos. Los precios son SOLO de prueba.
//
//   node mac/nube-local/rancho-real.mjs        (o «rancho-real» en .claude/launch.json)
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')
const PORT = 54342
const URL_NUBE = `http://127.0.0.1:${PORT}`
const PUBLICA = 'sb_publishable_local'
const PUERTO_WEB = 4325
const PUERTO_MAC = 5182

const hijos = []
function correr(nombre, cmd, args, env = {}) {
  // npm en Windows es un .cmd: necesita la terminal; node se llama directo (su ruta lleva espacios)
  const h = spawn(cmd, args, { cwd: RAIZ, env: { ...process.env, ...env }, shell: cmd === 'npm' && process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
  const eco = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`[${nombre}] ${l}`))
  h.stdout.on('data', eco)
  h.stderr.on('data', eco)
  hijos.push(h)
  return h
}
const cerrar = () => hijos.forEach((h) => h.kill())
process.on('exit', cerrar)
process.on('SIGINT', () => process.exit(0))

let listo = false
const nube = correr('nube', process.execPath, [join(AQUI, 'servidor.mjs'), '--memoria'], { NUBE_PORT: String(PORT) })
nube.stdout.on('data', (d) => String(d).includes('lista en') && (listo = true))
for (let i = 0; i < 200 && !listo; i++) await new Promise((r) => setTimeout(r, 150))
if (!listo) process.exit(1)

const dueno = createClient(URL_NUBE, PUBLICA, { auth: { persistSession: false, autoRefreshToken: false } })
await dueno.auth.signInWithPassword({ email: 'dueno@lajoya.local', password: 'la-joya-local' })
const rpc = async (f, a) => {
  const { data, error } = await dueno.rpc(f, a)
  if (error) throw new Error(`${f}: ${error.message}`)
  return data
}
await rpc('hosp_guardar_ajustes', {
  p: {
    reservas_web: true, anticipo_pct: 50, horas_apartado: 24, hora_llegada: '15:00', hora_salida: '12:00',
    banco: 'Banco de prueba', clabe: '000000000000000000', titular: 'Cuenta de prueba', url_web: `http://localhost:${PUERTO_WEB}`,
    telefono_hospedaje: '33 0000 0000', correo_avisos: 'dueno@lajoya.local', politicas: 'Políticas de prueba.', aviso_privacidad: 'Aviso de prueba.',
  },
})
const LUGARES = [
  { slug: 'sabas', nombre: 'Sabas', tipo: 'cabana', capacidad: 6 },
  { slug: 'cabana-san-miguel', nombre: 'Cabaña San Miguel', tipo: 'cabana', capacidad: 10 },
  { slug: 'cabana-elena', nombre: 'Cabaña Elena', tipo: 'cabana', capacidad: 4 },
  ...[11, 12, 13, 14, 15, 16, 1, 2, 3].map((n) => ({ slug: `habitacion-${n}`, nombre: `Habitación ${n}`, tipo: 'habitacion', capacidad: 2 })),
]
for (const [i, l] of LUGARES.entries()) {
  const [n, f] = l.tipo === 'cabana' ? [1000, 1300] : [600, 750]
  await rpc('hosp_guardar_cabana', { p: { ...l, precio_noche: n, precio_fin_semana: f, publicada: true, orden: i + 1 } })
}
console.log(`[rancho] Nube con los 12 hospedajes reales en ${URL_NUBE} (precios de prueba)`)

correr('mac', 'npm', ['--prefix', 'mac', 'run', 'dev', '--', '--port', String(PUERTO_MAC)], { VITE_SUPABASE_URL: URL_NUBE, VITE_SUPABASE_PUBLISHABLE_KEY: PUBLICA })

// La web se compila aparte (Astro no deja dos `astro dev` a la vez) en una carpeta temporal, sin tocar web/dist,
// y se sirve tal cual quedaría en Cloudflare Pages.
const SALIDA = join(tmpdir(), 'la-joya-rancho-real')
const build = correr('web', 'npm', ['--prefix', 'web', 'run', 'build', '--', '--outDir', `"${SALIDA}"`], { PUBLIC_SUPABASE_URL: URL_NUBE, PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLICA, PUBLIC_TURNSTILE_SITE_KEY: '' })
const codigo = await new Promise((r) => build.on('exit', r))
if (codigo !== 0) {
  console.error('[rancho] No compiló la web')
  process.exit(1)
}
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary' }
createServer(async (req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (ruta.endsWith('/')) ruta += 'index.html'
  let archivo = normalize(join(SALIDA, ruta))
  if (!archivo.startsWith(SALIDA)) return res.writeHead(403).end()
  if (!extname(archivo)) archivo = join(archivo, 'index.html')
  try {
    const cuerpo = await readFile(archivo)
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' }).end(cuerpo)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('No existe')
  }
}).listen(PUERTO_WEB, '127.0.0.1')
console.log(`[rancho] Web: http://localhost:${PUERTO_WEB}/reservar · App de la Mac: http://127.0.0.1:${PUERTO_MAC}`)

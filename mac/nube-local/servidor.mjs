// Nube local de hospedaje: Postgres de verdad (PGlite) con la migración real, en la computadora y sin Docker.
// Imita lo que usan la web y la app de la Mac de Supabase:
//   · /rest/v1/rpc/<función>   funciones de la base, con los roles anon / authenticated / service_role
//   · /auth/v1/token           inicio de sesión del dueño (correo y contraseña)
//   · /functions/v1/reservar   la misma función que corre en Supabase (supabase/functions/reservar/handler.ts)
//   · /storage/v1/...          fotos de las cabañas
//   · /realtime/v1/websocket   aviso «hubo cambios» en el canal privado «hospedaje»
//
//   npm run nube              → http://127.0.0.1:54331 (los datos se guardan en nube-local/.datos)
//   npm run nube -- --limpia  → empieza de cero
//   npm run nube:ejemplo      → además carga dos cabañas de prueba (con precios de prueba)
//
// Llaves: pública sb_publishable_local · secreta sb_secret_local
// Cuentas: dueno@lajoya.local (dueño), recepcion@lajoya.local, limpieza@lajoya.local · contraseña: la-joya-local
import http from 'node:http'
import crypto from 'node:crypto'
import { readFile, readdir, writeFile, mkdir, rm, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')
const DATOS = join(AQUI, '.datos')
const ARCHIVOS = join(DATOS, 'archivos')
const args = new Set(process.argv.slice(2))
const PORT = Number(process.env.NUBE_PORT || 54331)
const BASE = `http://127.0.0.1:${PORT}`
export const LLAVE_PUBLICA = 'sb_publishable_local'
export const LLAVE_SECRETA = 'sb_secret_local'
const CONTRASENA = process.env.NUBE_CONTRASENA || 'la-joya-local'
const FIRMA = 'nube-local-la-joya'

const CUENTAS = [
  { id: '00000000-0000-4000-8000-0000000000d1', email: 'dueno@lajoya.local', role: 'admin', nombre: 'Dueño' },
  { id: '00000000-0000-4000-8000-0000000000d2', email: 'recepcion@lajoya.local', role: 'recepcion', nombre: 'Recepción' },
  { id: '00000000-0000-4000-8000-0000000000d3', email: 'limpieza@lajoya.local', role: 'limpieza', nombre: 'Limpieza' },
]

const log = (...a) => console.log(new Date().toLocaleTimeString('es-MX'), ...a)

// ── Base de datos ──────────────────────────────────────────────────────
if (args.has('--limpia') && existsSync(DATOS)) await rm(DATOS, { recursive: true, force: true })
await mkdir(ARCHIVOS, { recursive: true })
const enMemoria = args.has('--memoria')
const pg = new PGlite({ dataDir: enMemoria ? undefined : join(DATOS, 'postgres'), extensions: { btree_gist } })
try {
  await pg.exec(await readFile(join(AQUI, 'supabase-local.sql'), 'utf8'))
  await pg.exec(await readFile(join(RAIZ, 'supabase', 'migrations', '20261105000000_hospedaje.sql'), 'utf8'))
await pg.exec(await readFile(join(RAIZ, 'supabase', 'migrations', '20261112000000_avisos_whatsapp.sql'), 'utf8'))
  for (const c of CUENTAS) {
    await pg.query('insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing', [c.id, c.email])
    await pg.query('insert into public.profiles (id, role, display_name) values ($1, $2, $3) on conflict (id) do update set role = excluded.role', [c.id, c.role, c.nombre])
  }
  if (args.has('--ejemplo')) await pg.exec(await readFile(join(AQUI, 'ejemplo.sql'), 'utf8'))
} catch (e) {
  console.error(`No se pudo preparar la base: ${e?.message}${e?.where ? `\n${e.where}` : ''}`)
  process.exit(1)
}

/** Corre una consulta como lo haría PostgREST: rol y datos de la sesión solo dentro de la transacción */
async function comoRol(quien, sql, params = []) {
  return pg.transaction(async (tx) => {
    await tx.query("select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)", [quien.role, JSON.stringify(quien.claims)])
    return tx.query(sql, params)
  })
}

// ── Sesiones (el token lleva el correo y la hora: sobreviven a reinicios, como en Supabase) ──
const firmar = (texto) => crypto.createHmac('sha256', FIRMA).update(texto).digest('base64url').slice(0, 22)
function sesion(cuenta) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const cuerpo = Buffer.from(JSON.stringify({ e: cuenta.email, x: exp })).toString('base64url')
  const refresh = Buffer.from(JSON.stringify({ e: cuenta.email, r: crypto.randomBytes(6).toString('hex') })).toString('base64url')
  return {
    access_token: `tok.${cuerpo}.${firmar(cuerpo)}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: `ref.${refresh}.${firmar(refresh)}`,
    user: usuario(cuenta),
  }
}
function usuario(c) {
  return { id: c.id, aud: 'authenticated', role: 'authenticated', email: c.email, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { nombre: c.nombre }, created_at: '2026-11-05T00:00:00Z' }
}
function leerToken(tok, prefijo) {
  const [p, cuerpo, firma] = String(tok || '').split('.')
  if (p !== prefijo || !cuerpo || firma !== firmar(cuerpo)) return null
  try {
    return JSON.parse(Buffer.from(cuerpo, 'base64url').toString())
  } catch {
    return null
  }
}
/** ¿Quién llama? Igual que Supabase: la llave secreta es service_role, una sesión es authenticated y la llave pública es anon */
function quienLlama(req) {
  const apikey = String(req.headers.apikey || '')
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (apikey === LLAVE_SECRETA || bearer === LLAVE_SECRETA) return { role: 'service_role', claims: { role: 'service_role' } }
  if (bearer.startsWith('tok.')) {
    const t = leerToken(bearer, 'tok')
    const c = t && CUENTAS.find((x) => x.email === t.e)
    if (!c || t.x < Date.now() / 1000) return { vencida: true }
    return { role: 'authenticated', claims: { sub: c.id, role: 'authenticated', email: c.email }, cuenta: c }
  }
  if (apikey === LLAVE_PUBLICA || bearer === LLAVE_PUBLICA) return { role: 'anon', claims: { role: 'anon' } }
  return null
}

// ── HTTP ───────────────────────────────────────────────────────────────
function enviar(res, status, cuerpo, headers = {}) {
  if (res.headersSent) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers })
  res.end(cuerpo === undefined ? '' : typeof cuerpo === 'string' || Buffer.isBuffer(cuerpo) ? cuerpo : JSON.stringify(cuerpo))
}
const leerCuerpo = (req) =>
  new Promise((resolve, reject) => {
    const partes = []
    req.on('data', (c) => partes.push(c))
    req.on('end', () => resolve(Buffer.concat(partes)))
    req.on('error', reject)
  })
function errorPostgres(e, quien) {
  const code = e?.code || 'XX000'
  const status = code === '42501' ? (quien?.role === 'anon' ? 401 : 403) : code === '42883' ? 404 : code === 'P0002' ? 404 : code.startsWith('23') ? 409 : code === '22P02' ? 400 : 400
  return { status, cuerpo: { code: code === '42883' ? 'PGRST202' : code, message: e?.message || 'Error', details: e?.detail ?? null, hint: e?.hint ?? null } }
}

const correos = [] // correos «enviados» en la nube local (se ven en /__correos)
const { manejarReserva } = await import(pathToFileURL(join(RAIZ, 'supabase', 'functions', 'reservar', 'handler.ts')).href)
const { mandarAvisos } = await import(pathToFileURL(join(RAIZ, 'supabase', 'functions', 'avisos-hospedaje', 'handler.ts')).href)

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, X-Total-Count')
  if (req.method === 'OPTIONS') return enviar(res, 204)
  const url = new URL(req.url, BASE)
  const ruta = url.pathname
  try {
    const cuerpo = req.method === 'GET' || req.method === 'HEAD' ? Buffer.alloc(0) : await leerCuerpo(req)
    const json = () => {
      try {
        return JSON.parse(cuerpo.toString() || 'null')
      } catch {
        return undefined
      }
    }

    if (ruta === '/' || ruta === '/__estado') {
      const r = await pg.query(`select
        (select count(*) from public.cabanas)::int as cabanas,
        (select count(*) from public.reservaciones)::int as reservaciones,
        (select count(*) from public.reservaciones where estado = 'solicitud')::int as solicitudes,
        (select reservas_web from public.hospedaje_ajustes where id) as reservas_web`)
      return enviar(res, 200, {
        nube: 'La Joya · hospedaje (nube local)',
        url: BASE,
        llave_publica: LLAVE_PUBLICA,
        cuentas: CUENTAS.map((c) => `${c.email} (${c.role})`),
        contrasena: CONTRASENA,
        ...r.rows[0],
        correos_simulados: correos.length,
        tiempo_real: sockets.size,
      })
    }
    if (ruta === '/__correos') return enviar(res, 200, correos)
    // Solo para probar: hace como si ya hubieran pasado las horas de apartado de una solicitud
    if (ruta === '/__vencer' && req.method === 'POST') {
      const r = await pg.query("update public.reservaciones set vence = now() - interval '1 minute' where id = $1 and estado = 'solicitud' returning codigo", [url.searchParams.get('id')])
      return enviar(res, 200, { ok: r.rows.length === 1, codigo: r.rows[0]?.codigo })
    }

    // ── Autenticación ──
    if (ruta === '/auth/v1/health' || ruta === '/auth/v1/settings') return enviar(res, 200, { name: 'nube-local', external: { email: true }, disable_signup: true })
    if (ruta === '/auth/v1/token') {
      const b = json() || {}
      const tipo = url.searchParams.get('grant_type')
      if (tipo === 'password') {
        const c = CUENTAS.find((x) => x.email === String(b.email || '').toLowerCase().trim())
        if (!c || b.password !== CONTRASENA) return enviar(res, 400, { code: 'invalid_credentials', error: 'invalid_grant', error_code: 'invalid_credentials', msg: 'Invalid login credentials', error_description: 'Invalid login credentials' })
        log('Sesión iniciada:', c.email)
        return enviar(res, 200, sesion(c))
      }
      if (tipo === 'refresh_token') {
        const t = leerToken(b.refresh_token, 'ref')
        const c = t && CUENTAS.find((x) => x.email === t.e)
        if (!c) return enviar(res, 400, { code: 'refresh_token_not_found', error: 'invalid_grant', msg: 'Invalid Refresh Token' })
        return enviar(res, 200, sesion(c))
      }
      return enviar(res, 400, { msg: 'grant_type no soportado' })
    }
    if (ruta === '/auth/v1/user') {
      const q = quienLlama(req)
      if (!q?.cuenta) return enviar(res, 401, { code: 'bad_jwt', msg: 'JWT expired' })
      return enviar(res, 200, usuario(q.cuenta))
    }
    if (ruta === '/auth/v1/logout') return enviar(res, 204)

    // ── Funciones de la base (PostgREST) ──
    if (ruta.startsWith('/rest/v1/rpc/')) {
      const fn = ruta.slice('/rest/v1/rpc/'.length)
      const quien = quienLlama(req)
      if (!quien) return enviar(res, 401, { code: 'PGRST301', message: 'Falta la llave (apikey)' })
      if (quien.vencida) return enviar(res, 401, { code: 'PGRST303', message: 'JWT expired' })
      if (!/^[a-z_][a-z0-9_]*$/.test(fn)) return enviar(res, 404, { code: 'PGRST202', message: `No existe la función ${fn}` })
      const argumentos = req.method === 'GET' ? Object.fromEntries(url.searchParams) : json()
      if (argumentos === undefined) return enviar(res, 400, { code: 'PGRST102', message: 'El cuerpo no es JSON válido' })
      const nombres = Object.keys(argumentos || {})
      if (nombres.some((n) => !/^[a-z_][a-z0-9_]*$/.test(n))) return enviar(res, 400, { code: 'PGRST102', message: 'Nombre de argumento inválido' })
      const sql = `select public.${fn}(${nombres.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`
      try {
        const r = await comoRol(quien, sql, nombres.map((n) => argumentos[n]))
        const valor = r.rows[0]?.r
        return enviar(res, 200, valor === undefined ? null : valor)
      } catch (e) {
        const { status, cuerpo: c } = errorPostgres(e, quien)
        if (status >= 500 || (c.code !== '42501' && c.code !== 'P0001' && !String(c.code).startsWith('23') && c.code !== '22023')) log(`rpc ${fn}:`, c.code, c.message)
        return enviar(res, status, c)
      }
    }
    if (ruta.startsWith('/rest/v1/')) return enviar(res, 403, { code: '42501', message: 'En hospedaje las tablas están cerradas: usa las funciones (rpc)' })

    // ── Funciones (Edge Functions) ──
    if (ruta === '/functions/v1/reservar') {
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress || '127.0.0.1')
      const peticion = new Request(BASE + ruta, { method: req.method, headers, body: req.method === 'POST' ? cuerpo : undefined })
      const r = await manejarReserva(peticion, { url: BASE, llaveSecreta: LLAVE_SECRETA, turnstileSecreto: process.env.TURNSTILE_SECRET || undefined, origenes: [] })
      const texto = await r.text()
      if (r.ok) {
        try {
          const j = JSON.parse(texto)
          log(`Solicitud nueva ${j.codigo} · ${j.cabana?.nombre} · ${j.llegada} → ${j.salida}`)
        } catch {}
      }
      res.writeHead(r.status, Object.fromEntries(r.headers))
      return res.end(texto)
    }

    // ── Fotos (Storage) ──
    const publica = ruta.match(/^\/storage\/v1\/object\/public\/([a-z0-9_-]+)\/(.+)$/)
    if (publica && (req.method === 'GET' || req.method === 'HEAD')) {
      const [, bucket, nombre] = publica
      const b = await pg.query('select public from storage.buckets where id = $1', [bucket])
      if (!b.rows[0]?.public) return enviar(res, 400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' })
      const archivo = rutaArchivo(bucket, decodeURIComponent(nombre))
      if (!archivo || !existsSync(archivo)) return enviar(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' })
      const meta = JSON.parse(await readFile(archivo + '.meta.json', 'utf8').catch(() => '{}'))
      res.writeHead(200, { 'Content-Type': meta.tipo || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' })
      return res.end(req.method === 'HEAD' ? undefined : await readFile(archivo))
    }
    const lista = ruta.match(/^\/storage\/v1\/object\/list\/([a-z0-9_-]+)$/)
    if (lista && req.method === 'POST') {
      if (quienLlama(req)?.role !== 'service_role') return enviar(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'Solo con la llave secreta' })
      const carpeta = join(ARCHIVOS, lista[1], normalize(json()?.prefix || '.'))
      const dentro = await readdir(carpeta, { withFileTypes: true }).catch(() => [])
      return enviar(res, 200, dentro.filter((e) => !e.name.endsWith('.meta.json')).map((e) => ({ name: e.name, id: e.isFile() ? e.name : null })))
    }
    const objeto = ruta.match(/^\/storage\/v1\/object\/([a-z0-9_-]+)(?:\/(.+))?$/)
    if (objeto) {
      const [, bucket, nombreCodificado] = objeto
      const quien = quienLlama(req)
      if (!quien || quien.vencida) return enviar(res, 401, { statusCode: '401', error: 'Unauthorized', message: 'Sesión vencida' })
      const permitido = quien.role === 'service_role' || (quien.role === 'authenticated' && (await comoRol(quien, 'select public.hosp_es_admin() as ok')).rows[0].ok)
      if (!permitido) return enviar(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' })
      if (req.method === 'DELETE') {
        const nombres = nombreCodificado ? [decodeURIComponent(nombreCodificado)] : (json()?.prefixes ?? [])
        for (const n of nombres) {
          const a = rutaArchivo(bucket, n)
          if (a) await Promise.all([unlink(a).catch(() => {}), unlink(a + '.meta.json').catch(() => {})])
        }
        return enviar(res, 200, nombres.map((name) => ({ name, bucket_id: bucket })))
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        const nombre = decodeURIComponent(nombreCodificado || '')
        const a = rutaArchivo(bucket, nombre)
        if (!a) return enviar(res, 400, { statusCode: '400', error: 'invalid_key', message: 'Nombre de archivo inválido' })
        const bk = (await pg.query('select * from storage.buckets where id = $1', [bucket])).rows[0]
        if (!bk) return enviar(res, 404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' })
        let datos = cuerpo
        let tipo = String(req.headers['content-type'] || 'application/octet-stream')
        if (tipo.startsWith('multipart/form-data')) {
          const form = await new Request(BASE, { method: 'POST', headers: { 'content-type': tipo }, body: cuerpo }).formData()
          const f = [...form.values()].find((v) => typeof v === 'object')
          if (!f) return enviar(res, 400, { statusCode: '400', error: 'no_file', message: 'Falta el archivo' })
          datos = Buffer.from(await f.arrayBuffer())
          tipo = f.type || 'application/octet-stream'
        }
        if (bk.allowed_mime_types?.length && !bk.allowed_mime_types.includes(tipo.split(';')[0])) return enviar(res, 415, { statusCode: '415', error: 'invalid_mime_type', message: `Tipo no permitido: ${tipo}` })
        if (bk.file_size_limit && datos.length > Number(bk.file_size_limit)) return enviar(res, 413, { statusCode: '413', error: 'Payload too large', message: 'La foto pesa demasiado' })
        if (existsSync(a) && req.method === 'POST' && req.headers['x-upsert'] !== 'true') return enviar(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' })
        await mkdir(dirname(a), { recursive: true })
        await writeFile(a, datos)
        await writeFile(a + '.meta.json', JSON.stringify({ tipo: tipo.split(';')[0] }))
        return enviar(res, 200, { Key: `${bucket}/${nombre}`, Id: crypto.randomUUID() })
      }
    }

    enviar(res, 404, { message: `Ruta no simulada en la nube local: ${req.method} ${ruta}` })
  } catch (e) {
    log('Error:', e)
    enviar(res, 500, { message: e instanceof Error ? e.message : String(e) })
  }
})

function rutaArchivo(bucket, nombre) {
  const limpio = normalize(nombre).replace(/^([/\\])+/, '')
  if (!limpio || limpio.startsWith('..') || limpio.includes(':')) return null
  return join(ARCHIVOS, bucket, limpio)
}

// ── Tiempo real: WebSocket mínimo con el protocolo de Phoenix (vsn 2.0.0), como scripts/nube-de-prueba.mjs ──
const sockets = new Set()
function marco(texto) {
  const data = Buffer.from(texto)
  const len = data.length
  const head = len < 126 ? Buffer.from([0x81, len]) : len < 65536 ? Buffer.from([0x81, 126, len >> 8, len & 255]) : Buffer.concat([Buffer.from([0x81, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b })()])
  return Buffer.concat([head, data])
}
const mandar = (sock, msg) => !sock.destroyed && sock.write(marco(JSON.stringify(msg)))
async function alMensaje(sock, crudo) {
  let msg
  try {
    msg = JSON.parse(crudo)
  } catch {
    return
  }
  const [joinRef, ref, topic, event, payload] = msg
  if (topic === 'phoenix' && event === 'heartbeat') return mandar(sock, [null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} }])
  if (event === 'phx_join') {
    // Canal privado: solo el equipo de hospedaje (igual que la regla en realtime.messages)
    if (topic === 'realtime:hospedaje') {
      const token = payload?.access_token || sock.token
      const q = quienLlama({ headers: { authorization: `Bearer ${token}` } })
      const ok = q?.role === 'authenticated' && (await comoRol(q, 'select public.hosp_es_equipo() as ok')).rows[0].ok
      if (!ok) return mandar(sock, [joinRef, ref, topic, 'phx_reply', { status: 'error', response: { reason: 'Unauthorized: el canal hospedaje es solo para el equipo' } }])
    }
    sock.subs.add(topic)
    return mandar(sock, [joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: [] } }])
  }
  if (event === 'phx_leave') {
    sock.subs.delete(topic)
    return mandar(sock, [joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }])
  }
  if (event === 'access_token' && payload?.access_token) sock.token = payload.access_token
  mandar(sock, [joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }])
}
server.on('upgrade', (req, sock) => {
  if (!req.url.startsWith('/realtime/v1/websocket')) return sock.destroy()
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  sock.subs = new Set()
  sockets.add(sock)
  let buf = Buffer.alloc(0)
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 2) {
      const op = buf[0] & 0x0f
      let len = buf[1] & 0x7f
      let off = 2
      if (len === 126) {
        if (buf.length < 4) return
        len = buf.readUInt16BE(2)
        off = 4
      } else if (len === 127) {
        if (buf.length < 10) return
        len = Number(buf.readBigUInt64BE(2))
        off = 10
      }
      const enmascarado = buf[1] & 0x80
      const offMascara = off
      if (enmascarado) off += 4
      if (buf.length < off + len) return
      let data = buf.subarray(off, off + len)
      if (enmascarado) {
        const mascara = buf.subarray(offMascara, offMascara + 4)
        data = Buffer.from(data.map((b, i) => b ^ mascara[i % 4]))
      }
      buf = buf.subarray(off + len)
      if (op === 8) return sock.end()
      if (op === 9) sock.write(Buffer.concat([Buffer.from([0x8a, data.length]), data]))
      if (op === 1) alMensaje(sock, data.toString())
    }
  })
  const adios = () => sockets.delete(sock)
  sock.on('close', adios)
  sock.on('error', adios)
})

await pg.listen('realtime', (crudo) => {
  let m
  try {
    m = JSON.parse(crudo)
  } catch {
    return
  }
  const topic = `realtime:${m.topic}`
  for (const s of sockets) if (s.subs.has(topic)) mandar(s, [null, null, topic, 'broadcast', { type: 'broadcast', event: m.event, payload: m.payload }])
})

// La base pide mandar correos (edge_post): se corre la misma lógica de la función, pero los correos se imprimen aquí
let correosPendientes = null
await pg.listen('edge', (funcion) => {
  if (funcion !== 'avisos-hospedaje' || correosPendientes) return
  correosPendientes = setTimeout(async () => {
    correosPendientes = null
    try {
      await mandarAvisos({
        url: BASE,
        llaveSecreta: LLAVE_SECRETA,
        enviar: async (c) => {
          correos.push({ ...c, enviado: new Date().toISOString() })
          log(`Correo simulado para ${c.para}: «${c.asunto}»`)
          return { ok: true, detalle: 'simulado en la nube local' }
        },
        enviarWhatsApp: async (c) => {
          correos.push({ ...c, enviado: new Date().toISOString() })
          log(`WhatsApp simulado: «${c.cuerpo}»`)
          return { ok: true, detalle: 'simulado en la nube local' }
        },
      })
    } catch (e) {
      log('No se pudieron mandar los correos:', e instanceof Error ? e.message : e)
    }
  }, 300)
})

// Lo que en Supabase hace pg_cron cada 10 minutos
setInterval(() => pg.query('select public.hosp_barrido()').catch((e) => log('Barrido:', e.message)), 60_000).unref?.()

server.listen(PORT, '127.0.0.1', () => {
  log(`Nube local de hospedaje lista en ${BASE}`)
  log(`Llave pública: ${LLAVE_PUBLICA} · cuenta del dueño: dueno@lajoya.local / ${CONTRASENA}`)
  if (args.has('--ejemplo')) log('Se cargaron cabañas de prueba (nube-local/ejemplo.sql)')
})

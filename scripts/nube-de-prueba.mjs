// Nube de prueba: imita a Supabase en la computadora para simular la sincronización sin cuentas reales.
// Implementa lo que usa La Joya: inicio de sesión, tabla documents (con la misma combinación campo por
// campo del trigger documents_lww), perfiles con rol, fotos y tiempo real (WebSocket de Phoenix).
//
//   node scripts/nube-de-prueba.mjs            → http://127.0.0.1:54321
//   En la app: Ajustes → Nube → URL http://127.0.0.1:54321, llave «prueba», correo admin@lajoya.mx (cualquier contraseña)
//
// Correos con rol: admin@, eventos@, recepcion@, limpieza@, mantenimiento@ (cualquier dominio).
//
// También simula (igual que la migración 20261104000000_pulido_nube.sql):
// - Reglas por rol al leer y escribir (un puesto no ve ni guarda colecciones ajenas).
// - Tiempo real por Broadcast privado: solo avisa «hubo cambios» en el canal «documentos».
// - Versión mínima (app_config), monitor central (devices, client_errors, device_health,
//   client_error_groups, backend_runs) y suscripciones push con el rol puesto por el servidor.
//
// Controles para provocar fallas a propósito:
//   POST /__caducar              → vencen todas las sesiones (la app debe renovar sin pedir volver a vincular)
//   POST /__lento?ms=30000       → cada respuesta tarda ese tiempo (la app debe cortar a los 20 s y reintentar)
//   POST /__desorden             → la siguiente subida se guarda con hora vieja y aparece 3 s después
//                                  (como dos subidas que terminan en desorden; la app no debe saltársela)
//   POST /__version?min=AAAAMMDDHHmm → exige una versión mínima
//   GET  /__estado               → conteos
import http from 'node:http'
import crypto from 'node:crypto'

const PORT = Number(process.env.NUBE_PORT || process.env.PORT || 54321)
const docs = new Map() // `${collection}:${id}` → fila
const files = new Map() // ruta → { type, body }
const sockets = new Set()
let seq = 0
const stats = { upserts: 0, rows: 0, pulls: 0, realtimeSent: 0, rechazadas: 0, sesionesVencidas: 0, renovaciones: 0 }
const control = { expiredBefore: 0, slowMs: 0, disorderNext: false }
// Tablas sencillas (sin combinación campo por campo)
const tables = {
  app_config: new Map([['min_build', { key: 'min_build', value: '000000000000' }]]),
  devices: new Map(),
  client_errors: new Map(),
  backend_runs: new Map(),
  push_subscriptions: new Map(),
}
let errorSeq = 0

// Qué colecciones puede leer / escribir cada rol (copia de readable_collections / writable_collections)
const READ = {
  eventos: ['employees', 'units', 'reservations', 'events', 'payments', 'tasks', 'photos', 'inventory', 'notifications', 'audit', 'vendors', 'lostfound'],
  recepcion: ['employees', 'units', 'reservations', 'payments', 'tasks', 'photos', 'inventory', 'notifications', 'lostfound'],
  limpieza: ['employees', 'units', 'reservations', 'tasks', 'photos', 'inventory', 'notifications', 'lostfound'],
  mantenimiento: ['employees', 'units', 'reservations', 'tasks', 'photos', 'inventory', 'notifications', 'lostfound'],
}
const WRITE = {
  eventos: ['events', 'payments', 'tasks', 'photos', 'inventory', 'notifications', 'audit', 'vendors', 'lostfound'],
  recepcion: ['units', 'reservations', 'payments', 'tasks', 'photos', 'notifications', 'audit', 'lostfound'],
  limpieza: ['units', 'tasks', 'photos', 'inventory', 'notifications', 'audit', 'lostfound'],
  mantenimiento: ['units', 'tasks', 'photos', 'inventory', 'notifications', 'audit', 'lostfound'],
}
const canRead = (role, col) => role === 'admin' || (READ[role] || []).includes(col)
const canWrite = (role, col) => role === 'admin' || (WRITE[role] || []).includes(col)

/** Hora del servidor con microsegundos, siempre creciente (como clock_timestamp()) */
function clock() {
  const d = new Date()
  seq = (seq + 1) % 1000
  const micros = String(d.getUTCMilliseconds() * 1000 + seq).padStart(6, '0')
  return d.toISOString().slice(0, 19) + '.' + micros + '+00:00'
}

// ── Combinación campo por campo (copia del trigger documents_lww) ──
const META = new Set(['_ft', 'id', 'createdAt', 'updatedAt', 'updatedBy'])
function lww(oldData, newData) {
  const merged = { ...oldData }
  const nft = newData._ft || {}
  const oft = { ...(oldData._ft || {}) }
  for (const k of Object.keys(newData)) {
    if (META.has(k)) continue
    const nts = nft[k] ?? newData.updatedAt ?? ''
    // Campo nuevo (el servidor no lo tenía): siempre se acepta. Igual que la migración 20261102000000.
    const ots = k in oldData ? oft[k] ?? oldData.updatedAt ?? '' : ''
    if (nts >= ots) {
      merged[k] = newData[k]
      oft[k] = nts
    }
  }
  merged._ft = oft
  merged.updatedAt = [oldData.updatedAt || '', newData.updatedAt || ''].sort().at(-1)
  if ((newData.updatedAt || '') > (oldData.updatedAt || '')) merged.updatedBy = newData.updatedBy ?? null
  return merged
}

function upsertRow(row, userId, oldStamp) {
  const key = `${row.collection}:${row.id}`
  const prev = docs.get(key)
  const data = prev ? lww(prev.data, row.data) : row.data
  const next = { collection: row.collection, id: row.id, data, deleted: !!data.deleted, updated_at: oldStamp ?? clock(), updated_by: userId }
  docs.set(key, next)
  return next
}

// ── Usuarios ──
const ROLES = ['admin', 'eventos', 'recepcion', 'limpieza', 'mantenimiento']
const EMPLOYEE = { admin: 'e_admin', eventos: 'e_lupita', recepcion: 'e_ana', limpieza: 'e_maria', mantenimiento: 'e_chuy' }
const userOf = (email) => {
  const role = ROLES.find((r) => email.toLowerCase().startsWith(r)) || 'admin'
  const id = crypto.createHash('md5').update(email.toLowerCase()).digest('hex')
  const uuid = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`
  return { id: uuid, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: { rol: role }, created_at: '2026-11-01T00:00:00Z', appRole: role }
}
const tokens = new Map() // token → usuario
function session(user) {
  // El token lleva el correo y la hora: la sesión sigue valiendo aunque la nube de prueba se reinicie (como
  // en Supabase), y /__caducar puede vencer las anteriores
  const access = 'tok_' + Buffer.from(user.email).toString('base64url') + '_' + Date.now().toString(16) + crypto.randomBytes(3).toString('hex')
  tokens.set(access, user)
  const { appRole: _r, ...u } = user
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ref_' + user.email, user: u }
}
const userFromReq = (req) => {
  const tok = (req.headers.authorization || '').replace(/^Bearer /, '')
  const m = tok.match(/^tok_([A-Za-z0-9_-]+)_([0-9a-f]{11,})[0-9a-f]{6}$/)
  if (!m) return undefined
  // Sesión vencida a propósito (/__caducar): hay que renovarla
  if (parseInt(m[2], 16) < control.expiredBefore) return undefined
  if (tokens.has(tok)) return tokens.get(tok)
  try {
    return userOf(Buffer.from(m[1], 'base64url').toString())
  } catch {
    return undefined
  }
}

// ── HTTP ──
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body))
}
const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, X-Total-Count')
  if (req.method === 'OPTIONS') return send(res, 204)
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname
  const body = req.method === 'GET' || req.method === 'HEAD' ? Buffer.alloc(0) : await readBody(req)

  // Controles para provocar fallas
  if (path === '/__caducar') {
    control.expiredBefore = Date.now()
    stats.sesionesVencidas++
    return send(res, 200, { ok: true, mensaje: 'Sesiones vencidas' })
  }
  if (path === '/__lento') {
    control.slowMs = Number(url.searchParams.get('ms') || 0)
    return send(res, 200, { ok: true, lentoMs: control.slowMs })
  }
  if (path === '/__desorden') {
    control.disorderNext = true
    return send(res, 200, { ok: true })
  }
  if (path === '/__version') {
    tables.app_config.set('min_build', { key: 'min_build', value: url.searchParams.get('min') || '000000000000' })
    return send(res, 200, { ok: true, min: tables.app_config.get('min_build').value })
  }
  if (control.slowMs && !path.startsWith('/__')) {
    await new Promise((r) => setTimeout(r, control.slowMs))
    // La app ya se cansó de esperar y cortó la conexión
    if (res.destroyed || res.writableEnded) return
  }
  const json = () => {
    try {
      return JSON.parse(body.toString() || 'null')
    } catch {
      return null
    }
  }

  // Autenticación
  if (path === '/auth/v1/health') return send(res, 200, { name: 'nube-de-prueba' })
  if (path === '/auth/v1/token') {
    const b = json() || {}
    if (url.searchParams.get('grant_type') === 'password') {
      if (!b.email || !b.password) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' })
      return send(res, 200, session(userOf(b.email)))
    }
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      stats.renovaciones++
      return send(res, 200, session(userOf(String(b.refresh_token || '').replace(/^ref_/, '') || 'admin@lajoya.mx')))
    }
  }
  if (path === '/auth/v1/user') {
    const u = userFromReq(req)
    if (!u) return send(res, 401, { msg: 'JWT expired' })
    const { appRole: _r, ...rest } = u
    return send(res, 200, rest)
  }
  if (path === '/auth/v1/logout') return send(res, 204)

  // Datos (PostgREST)
  if (path === '/rest/v1/profiles') {
    const u = userFromReq(req)
    const rows = u ? [{ role: u.appRole, employee_id: EMPLOYEE[u.appRole] }] : []
    if ((req.headers.accept || '').includes('vnd.pgrst.object')) return rows.length ? send(res, 200, rows[0]) : send(res, 406, { message: 'no rows' })
    return send(res, 200, rows)
  }
  if (path === '/rest/v1/documents') {
    const u = userFromReq(req)
    if (!u) return send(res, 401, { message: 'JWT expired' })
    if (req.method === 'POST') {
      const rows = [].concat(json() || [])
      // Como en Postgres: si una sola fila no se permite, se rechaza toda la subida
      if (rows.some((r) => !canWrite(u.appRole, r.collection))) {
        stats.rechazadas++
        return send(res, 403, { code: '42501', message: 'new row violates row-level security policy for table "documents"' })
      }
      stats.upserts++
      stats.rows += rows.length
      if (control.disorderNext) {
        // Se guarda con la hora de ahora, pero aparece 3 s después (como una transacción lenta)
        control.disorderNext = false
        const stamp = clock()
        setTimeout(() => {
          for (const r of rows) upsertRow(r, u.id, stamp)
          broadcastChange()
        }, 3000)
        return send(res, 201)
      }
      const out = rows.map((r) => upsertRow(r, u.id))
      broadcastChange()
      return (req.headers.prefer || '').includes('return=representation') ? send(res, 201, out) : send(res, 201)
    }
    let list = [...docs.values()].filter((r) => canRead(u.appRole, r.collection))
    const gt = url.searchParams.get('updated_at')
    if (gt?.startsWith('gt.')) list = list.filter((r) => r.updated_at > gt.slice(3))
    list.sort((a, b) => a.updated_at.localeCompare(b.updated_at))
    const total = list.length
    const limit = Number(url.searchParams.get('limit') || 1000)
    list = list.slice(0, limit)
    const select = (url.searchParams.get('select') || '*').split(',')
    const rows = list.map((r) => (select[0] === '*' ? r : Object.fromEntries(select.map((k) => [k, r[k]]))))
    stats.pulls++
    const headers = { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${total}` }
    if (req.method === 'HEAD') return send(res, 200, undefined, headers)
    return send(res, 200, rows, headers)
  }

  // Tablas del monitor, configuración y avisos push
  const tm = path.match(/^\/rest\/v1\/(app_config|devices|client_errors|backend_runs|push_subscriptions|device_health|client_error_groups)$/)
  if (tm) {
    const u = userFromReq(req)
    if (!u) return send(res, 401, { message: 'JWT expired' })
    const name = tm[1]
    const admin = u.appRole === 'admin'
    if (req.method === 'POST') {
      const rows = [].concat(json() || [])
      if (name === 'app_config' && !admin) return send(res, 403, { code: '42501', message: 'new row violates row-level security policy for table "app_config"' })
      for (const r of rows) {
        if (name === 'devices') {
          const prev = tables.devices.get(r.device_id)
          if (prev && prev.user_id !== u.id) return send(res, 403, { code: '42501', message: 'new row violates row-level security policy for table "devices"' })
          const now = new Date().toISOString()
          tables.devices.set(r.device_id, { ...prev, ...r, user_id: u.id, account_email: u.email, last_seen: now, first_seen: prev?.first_seen ?? now, version_since: prev && prev.app_build === r.app_build ? prev.version_since : now })
        } else if (name === 'client_errors') {
          const id = ++errorSeq
          const fingerprint = crypto.createHash('md5').update(`${r.source}:${String(r.message).toLowerCase().replace(/[0-9a-f]{8,}|[0-9]+/g, '#')}`).digest('hex')
          tables.client_errors.set(id, { ...r, id, user_id: u.id, fingerprint, created_at: new Date().toISOString() })
        } else if (name === 'push_subscriptions') {
          // El rol lo pone el servidor, no el celular
          tables.push_subscriptions.set(r.endpoint, { ...r, user_id: u.id, role: u.appRole })
        } else if (name === 'app_config') tables.app_config.set(r.key, { key: r.key, value: r.value })
      }
      return send(res, 201)
    }
    if (req.method === 'DELETE' && name === 'push_subscriptions') {
      const ep = (url.searchParams.get('endpoint') || '').replace(/^eq\./, '')
      tables.push_subscriptions.delete(ep)
      return send(res, 204)
    }
    let rows
    if (name === 'device_health') {
      if (!admin) rows = []
      else {
        const min = tables.app_config.get('min_build')?.value
        const errs = [...tables.client_errors.values()]
        rows = [...tables.devices.values()].map((d) => {
          const errors_24h = errs.filter((e) => e.device_id === d.device_id && Date.now() - Date.parse(e.created_at) < 86400000).length
          const stuck = d.pending_count > 0 && Date.now() - Date.parse(d.last_sync_at || d.first_seen) > 2 * 3600000
          const belowMin = min && d.app_build < min
          const health = stuck || belowMin || d.rejected_count > 0 || d.sync_status === 'error' ? 'rojo' : errors_24h >= 5 ? 'amarillo' : 'verde'
          const health_reason = stuck
            ? `${d.pending_count} ${d.pending_count === 1 ? 'cambio' : 'cambios'} sin subir desde hace más de 2 horas`
            : belowMin
              ? 'Versión más vieja de la que pide la nube'
              : d.rejected_count > 0
                ? `La nube rechazó ${d.rejected_count} ${d.rejected_count === 1 ? 'cambio' : 'cambios'} por permisos`
                : d.sync_status === 'error'
                  ? d.sync_error || 'Error al sincronizar'
                  : errors_24h >= 5
                    ? `${errors_24h} errores en las últimas 24 horas`
                    : null
          return { ...d, errors_24h, health, health_reason }
        })
      }
    } else if (name === 'client_error_groups') {
      const groups = new Map()
      for (const e of admin ? tables.client_errors.values() : []) {
        const g = groups.get(e.fingerprint) ?? { fingerprint: e.fingerprint, source: e.source, sample_message: e.message, sample_page: e.page, occurrences: 0, devices: new Set(), first_seen: e.happened_at, last_seen: e.happened_at }
        g.occurrences++
        g.devices.add(e.device_id)
        if (e.happened_at < g.first_seen) g.first_seen = e.happened_at
        if (e.happened_at > g.last_seen) g.last_seen = e.happened_at
        groups.set(e.fingerprint, g)
      }
      rows = [...groups.values()].map((g) => ({ ...g, devices: g.devices.size }))
    } else if (name === 'devices') rows = [...tables.devices.values()].filter((d) => admin || d.user_id === u.id)
    else if (name === 'client_errors' || name === 'backend_runs') rows = admin ? [...tables[name].values()] : []
    else rows = [...tables[name].values()]
    // Filtros sencillos de PostgREST: col=eq.valor y col=in.(a,b)
    for (const [k, v] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset'].includes(k)) continue
      if (v.startsWith('eq.')) rows = rows.filter((r) => String(r[k]) === v.slice(3))
      if (v.startsWith('in.(')) {
        const set = new Set(v.slice(4, -1).split(','))
        rows = rows.filter((r) => set.has(String(r[k])))
      }
    }
    if ((req.headers.accept || '').includes('vnd.pgrst.object')) return rows.length ? send(res, 200, rows[0]) : send(res, 406, { message: 'no rows', code: 'PGRST116' })
    return send(res, 200, rows)
  }

  // Fotos (Storage)
  let m
  if ((m = path.match(/^\/storage\/v1\/object\/list\/([^/]+)$/))) return send(res, 200, [])
  if ((m = path.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/))) {
    if (req.method === 'POST') return send(res, 200, { signedURL: `/object/sign/${m[1]}/${m[2]}?token=prueba` })
    const f = files.get(`${m[1]}/${m[2]}`)
    return f ? send(res, 200, f.body, { 'Content-Type': f.type }) : send(res, 404, { message: 'not found' })
  }
  if ((m = path.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/)) && (req.method === 'POST' || req.method === 'PUT')) {
    files.set(`${m[1]}/${m[2]}`, { type: req.headers['content-type'] || 'application/octet-stream', body })
    return send(res, 200, { Key: `${m[1]}/${m[2]}`, Id: crypto.randomUUID() })
  }

  if (path === '/__estado')
    return send(res, 200, {
      documentos: docs.size,
      fotos: files.size,
      conexionesTiempoReal: sockets.size,
      dispositivos: tables.devices.size,
      errores: tables.client_errors.size,
      suscripcionesPush: [...tables.push_subscriptions.values()].map((s) => ({ role: s.role })),
      versionMinima: tables.app_config.get('min_build')?.value,
      ...stats,
    })
  if (path === '/__dispositivos') return send(res, 200, [...tables.devices.values()])
  if (path === '/__errores') return send(res, 200, [...tables.client_errors.values()])
  send(res, 404, { message: `Ruta no simulada: ${req.method} ${path}` })
})

// ── Tiempo real: WebSocket mínimo con el protocolo de Phoenix (vsn 2.0.0) ──
function frame(text) {
  const data = Buffer.from(text)
  const len = data.length
  const head = len < 126 ? Buffer.from([0x81, len]) : len < 65536 ? Buffer.from([0x81, 126, len >> 8, len & 255]) : Buffer.concat([Buffer.from([0x81, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b })()])
  return Buffer.concat([head, data])
}
function sendMsg(sock, msg) {
  if (!sock.destroyed) sock.write(frame(JSON.stringify(msg)))
}
/** Broadcast privado: un aviso por subida, sin datos (cada dispositivo baja lo nuevo con sus permisos) */
function broadcastChange() {
  for (const s of sockets)
    for (const [topic] of s.subs)
      if (topic === 'realtime:documentos') {
        stats.realtimeSent++
        sendMsg(s, [null, null, topic, 'broadcast', { type: 'broadcast', event: 'cambio', payload: { at: new Date().toISOString() } }])
      }
}
function presenceList(topic) {
  const out = {}
  for (const s of sockets) {
    const sub = s.subs.get(topic)
    if (sub?.presenceKey && sub.meta) out[sub.presenceKey] = { metas: [{ phx_ref: sub.ref, ...sub.meta }] }
  }
  return out
}
function handleMsg(sock, raw) {
  let msg
  try {
    msg = JSON.parse(raw)
  } catch {
    return
  }
  const [joinRef, ref, topic, event, payload] = msg
  if (topic === 'phoenix' && event === 'heartbeat') return sendMsg(sock, [null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} }])
  if (event === 'phx_join') {
    const cfg = payload?.config || {}
    const sub = { ref: crypto.randomBytes(4).toString('hex'), presenceKey: cfg.presence?.key || '', meta: null, changesId: null }
    const response = {}
    if (cfg.postgres_changes?.length) {
      sub.changesId = Math.floor(Math.random() * 1e8)
      response.postgres_changes = cfg.postgres_changes.map((f) => ({ id: sub.changesId, event: f.event, schema: f.schema, table: f.table, ...(f.filter ? { filter: f.filter } : {}) }))
    }
    sock.subs.set(topic, sub)
    sendMsg(sock, [joinRef, ref, topic, 'phx_reply', { status: 'ok', response }])
    if (cfg.presence?.enabled !== false && topic.includes('presencia')) sendMsg(sock, [joinRef, null, topic, 'presence_state', presenceList(topic)])
    return
  }
  if (event === 'phx_leave') {
    sock.subs.delete(topic)
    return sendMsg(sock, [joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }])
  }
  if (event === 'presence') {
    const sub = sock.subs.get(topic)
    if (sub && payload?.event === 'track') {
      sub.meta = payload.payload
      for (const s of sockets) if (s.subs.has(topic)) sendMsg(s, [null, null, topic, 'presence_diff', { joins: { [sub.presenceKey]: { metas: [{ phx_ref: sub.ref, ...sub.meta }] } }, leaves: {} }])
    }
    return sendMsg(sock, [joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }])
  }
  // access_token, broadcast u otros: se aceptan
  sendMsg(sock, [joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }])
}
server.on('upgrade', (req, sock) => {
  if (!req.url.startsWith('/realtime/v1/websocket')) return sock.destroy()
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  sock.subs = new Map()
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
      const masked = buf[1] & 0x80
      const maskOff = off
      if (masked) off += 4
      if (buf.length < off + len) return
      let data = buf.subarray(off, off + len)
      if (masked) {
        const mask = buf.subarray(maskOff, maskOff + 4)
        data = Buffer.from(data.map((b, i) => b ^ mask[i % 4]))
      }
      buf = buf.subarray(off + len)
      if (op === 8) return sock.end()
      if (op === 9) sock.write(Buffer.concat([Buffer.from([0x8a, data.length]), data]))
      if (op === 1) handleMsg(sock, data.toString())
    }
  })
  const bye = () => {
    if (!sockets.has(sock)) return
    sockets.delete(sock)
    for (const [topic, sub] of sock.subs)
      if (sub.presenceKey && sub.meta) for (const s of sockets) if (s.subs.has(topic)) sendMsg(s, [null, null, topic, 'presence_diff', { joins: {}, leaves: { [sub.presenceKey]: { metas: [{ phx_ref: sub.ref, ...sub.meta }] } } }])
  }
  sock.on('close', bye)
  sock.on('error', bye)
})

server.listen(PORT, '127.0.0.1', () => console.log(`Nube de prueba lista en http://127.0.0.1:${PORT} · estado en /__estado`))

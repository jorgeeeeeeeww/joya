// Nube de prueba: imita a Supabase en la computadora para simular la sincronización sin cuentas reales.
// Implementa lo que usa La Joya: inicio de sesión, tabla documents (con la misma combinación campo por
// campo del trigger documents_lww), perfiles con rol, fotos y tiempo real (WebSocket de Phoenix).
//
//   node scripts/nube-de-prueba.mjs            → http://127.0.0.1:54321
//   En la app: Ajustes → Nube → URL http://127.0.0.1:54321, llave «prueba», correo admin@lajoya.mx (cualquier contraseña)
//
// Correos con rol: admin@, eventos@, recepcion@, limpieza@, mantenimiento@ (cualquier dominio).
import http from 'node:http'
import crypto from 'node:crypto'

const PORT = Number(process.env.PORT || 54321)
const docs = new Map() // `${collection}:${id}` → fila
const files = new Map() // ruta → { type, body }
const sockets = new Set()
let seq = 0
const stats = { upserts: 0, rows: 0, pulls: 0, realtimeSent: 0 }

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

function upsertRow(row, userId) {
  const key = `${row.collection}:${row.id}`
  const prev = docs.get(key)
  const data = prev ? lww(prev.data, row.data) : row.data
  const next = { collection: row.collection, id: row.id, data, deleted: !!data.deleted, updated_at: clock(), updated_by: userId }
  docs.set(key, next)
  broadcastChange(prev ? 'UPDATE' : 'INSERT', next)
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
  // El token lleva el correo: la sesión sigue valiendo aunque la nube de prueba se reinicie (como en Supabase)
  const access = 'tok_' + Buffer.from(user.email).toString('base64url') + '_' + crypto.randomBytes(6).toString('hex')
  tokens.set(access, user)
  const { appRole: _r, ...u } = user
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ref_' + user.email, user: u }
}
const userFromReq = (req) => {
  const tok = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (tokens.has(tok)) return tokens.get(tok)
  const m = tok.match(/^tok_([A-Za-z0-9_-]+)_[0-9a-f]+$/)
  if (!m) return undefined
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
    if (url.searchParams.get('grant_type') === 'refresh_token') return send(res, 200, session(userOf(String(b.refresh_token || '').replace(/^ref_/, '') || 'admin@lajoya.mx')))
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
      stats.upserts++
      stats.rows += rows.length
      const out = rows.map((r) => upsertRow(r, u.id))
      return (req.headers.prefer || '').includes('return=representation') ? send(res, 201, out) : send(res, 201)
    }
    let list = [...docs.values()]
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

  if (path === '/__estado') return send(res, 200, { documentos: docs.size, fotos: files.size, conexionesTiempoReal: sockets.size, ...stats })
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
function broadcastChange(type, row) {
  for (const s of sockets)
    for (const [topic, sub] of s.subs)
      if (sub.changesId) {
        stats.realtimeSent++
        sendMsg(s, [null, null, topic, 'postgres_changes', { ids: [sub.changesId], data: { schema: 'public', table: 'documents', commit_timestamp: row.updated_at, type, record: row, old_record: {}, columns: [], errors: null } }])
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

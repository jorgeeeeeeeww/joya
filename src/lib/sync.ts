// Motor de sincronización offline-first con Supabase.
//
// Cómo funciona:
// - Todo se guarda primero en el dispositivo (store.ts). Aquí solo se sube y se baja.
// - Una sola pestaña por dispositivo es "líder" (Web Locks) y habla con la nube; las demás
//   reciben los cambios por BroadcastChannel. Así no hay trabajo duplicado ni carreras.
// - Subida: lotes de 200, reintentos con espera exponencial + aleatoria (1 s → 60 s), filas que el
//   rol no puede escribir (RLS) se aíslan y se reportan sin bloquear el resto.
// - Bajada: cursor por updated_at del servidor + Realtime; al reconectar se recupera lo perdido.
// - Conflictos: combinación campo por campo (cliente y servidor, ver trigger documents_lww).
// - Presencia: quién del equipo está conectado y en qué sección.
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { onLocalChange, useStore } from './store'
import type { CollectionName, Collections, Photo, Role } from './types'
import { COLLECTIONS } from './types'

const LAST_PULL_KEY = 'lajoya:lastPull'
let client: SupabaseClient | null = null
let clientKey = ''

export async function getClient(): Promise<SupabaseClient | null> {
  const { supabaseUrl, supabaseAnonKey } = useStore.getState().settings
  if (!supabaseUrl || !supabaseAnonKey) return null
  const key = supabaseUrl + supabaseAnonKey
  if (client && clientKey === key) return client
  const { createClient } = await import('@supabase/supabase-js')
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'lajoya-auth' },
    realtime: { params: { eventsPerSecond: 20 } },
  })
  clientKey = key
  return client
}

const log = (level: 'info' | 'warn' | 'error', msg: string) => useStore.getState().syncLog(level, msg)
const setSync = (s: Parameters<ReturnType<typeof useStore.getState>['setSync']>[0]) => useStore.getState().setSync(s)

// ── Diagnóstico ──────────────────────────────────────────
export interface CheckResult {
  key: string
  label: string
  ok: boolean | null
  detail?: string
}

/** Prueba la conexión antes de iniciar sesión (servidor, API y autenticación). */
export async function testConnection(url: string, anonKey: string): Promise<{ checks: CheckResult[]; latencyMs?: number }> {
  const base = url.trim().replace(/\/$/, '')
  const checks: CheckResult[] = []
  const headers = { apikey: anonKey.trim(), Authorization: `Bearer ${anonKey.trim()}` }
  const t0 = performance.now()
  try {
    const r = await fetch(`${base}/auth/v1/health`, { headers, signal: AbortSignal.timeout(8000) })
    const latencyMs = Math.round(performance.now() - t0)
    checks.push({ key: 'server', label: 'El servidor responde', ok: r.ok, detail: r.ok ? `${latencyMs} ms` : `HTTP ${r.status}` })
    const rest = await fetch(`${base}/rest/v1/documents?select=id&limit=1`, { headers, signal: AbortSignal.timeout(8000) })
    checks.push({
      key: 'schema',
      label: 'Base de datos lista',
      ok: rest.ok || rest.status === 401,
      detail: rest.status === 404 ? 'Falta ejecutar la migración SQL' : rest.ok ? 'Tabla documents encontrada' : rest.status === 401 ? 'Protegida (correcto)' : `HTTP ${rest.status}`,
    })
    checks.push({ key: 'https', label: 'Conexión cifrada', ok: base.startsWith('https://') || /localhost|\.local|192\.168\./.test(base), detail: base.startsWith('https://') ? 'HTTPS/TLS' : 'Red local' })
    return { checks, latencyMs }
  } catch (e: any) {
    checks.push({ key: 'server', label: 'El servidor responde', ok: false, detail: e?.name === 'TimeoutError' ? 'No contestó en 8 s' : 'No se pudo conectar (revisa la URL)' })
    return { checks }
  }
}

/** Diagnóstico completo con la sesión iniciada */
export async function diagnose(): Promise<CheckResult[]> {
  const sb = await getClient()
  if (!sb) return [{ key: 'config', label: 'Conexión configurada', ok: false, detail: 'Falta URL y llave' }]
  const out: CheckResult[] = [{ key: 'config', label: 'Conexión configurada', ok: true }]
  const { data: sess } = await sb.auth.getSession()
  out.push({ key: 'auth', label: 'Dispositivo vinculado', ok: !!sess.session, detail: sess.session?.user.email ?? 'Inicia sesión con la cuenta del equipo' })
  if (!sess.session) return out
  const t0 = performance.now()
  const { data: profile, error: pErr } = await sb.from('profiles').select('role').maybeSingle()
  const latency = Math.round(performance.now() - t0)
  setSync({ latencyMs: latency })
  out.push({ key: 'profile', label: 'Rol asignado', ok: !!profile && !pErr, detail: profile ? `Rol: ${profile.role}` : 'Agrega la cuenta a la tabla profiles' })
  const { count, error: cErr } = await sb.from('documents').select('id', { count: 'exact', head: true })
  out.push({ key: 'rls', label: 'Seguridad por rol activa', ok: !cErr, detail: cErr ? cErr.message : `${count ?? 0} registros visibles para tu rol` })
  const { error: sErr } = await sb.storage.from('fotos').list('', { limit: 1 })
  out.push({ key: 'storage', label: 'Almacén de fotos', ok: !sErr, detail: sErr ? 'Falta el bucket "fotos"' : 'Privado, con URLs firmadas' })
  out.push({ key: 'realtime', label: 'Tiempo real', ok: useStore.getState().sync.realtime === 'live', detail: useStore.getState().sync.realtime === 'live' ? 'Escuchando cambios' : 'Conectando…' })
  out.push({ key: 'latency', label: 'Latencia', ok: latency < 800, detail: `${latency} ms` })
  return out
}

/** Vincula este dispositivo con una cuenta del equipo (una vez por dispositivo). */
export async function connectCloud(url: string, anonKey: string, email: string, password: string) {
  useStore.getState().setSettings({ supabaseUrl: url.trim().replace(/\/$/, ''), supabaseAnonKey: anonKey.trim() })
  const sb = await getClient()
  if (!sb) throw new Error('Faltan datos de conexión')
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : error.message)
  const { data: profile, error: pErr } = await sb.from('profiles').select('role, employee_id').maybeSingle()
  if (pErr || !profile) throw new Error('La cuenta no tiene rol asignado. Agrégala a la tabla "profiles".')
  log('info', `Dispositivo vinculado como ${profile.role}`)
  restartSync()
  return profile as { role: string; employee_id: string | null }
}

export async function disconnectCloud() {
  const sb = await getClient()
  await sb?.auth.signOut()
  useStore.getState().setSettings({ supabaseUrl: undefined, supabaseAnonKey: undefined })
  localStorage.removeItem(LAST_PULL_KEY)
  log('info', 'Dispositivo desvinculado')
  restartSync()
}

// ── Enlace / QR para vincular otro dispositivo ───────────
export function buildLinkUrl() {
  const { supabaseUrl, supabaseAnonKey } = useStore.getState().settings
  if (!supabaseUrl || !supabaseAnonKey) return null
  const payload = btoa(JSON.stringify({ u: supabaseUrl, k: supabaseAnonKey }))
  return `${location.origin}/ajustes?tab=nube#vincular=${encodeURIComponent(payload)}`
}

/** Lee #vincular=… al abrir la app desde un QR y prellena la conexión (no inicia sesión). */
export function consumeLinkFromUrl(): boolean {
  const m = location.hash.match(/vincular=([^&]+)/)
  if (!m) return false
  try {
    const { u, k } = JSON.parse(atob(decodeURIComponent(m[1]!)))
    if (typeof u === 'string' && typeof k === 'string' && /^https?:\/\//.test(u)) {
      sessionStorage.setItem('lajoya:pendingLink', JSON.stringify({ u, k }))
      history.replaceState(null, '', location.pathname + location.search)
      return true
    }
  } catch {
    /* enlace inválido */
  }
  return false
}
export function pendingLink(): { u: string; k: string } | null {
  try {
    return JSON.parse(sessionStorage.getItem('lajoya:pendingLink') || 'null')
  } catch {
    return null
  }
}

// ── Fotos ────────────────────────────────────────────────
async function uploadPhoto(sb: SupabaseClient, photo: Photo): Promise<Photo> {
  if (!photo.dataUrl || photo.storagePath) return photo
  const blob = await (await fetch(photo.dataUrl)).blob()
  const path = `${photo.id}.jpg`
  const { error } = await sb.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
  useStore.getState().patch('photos', photo.id, { storagePath: path }, { silent: true })
  return { ...photo, storagePath: path }
}

// ── Subida con reintentos ────────────────────────────────
let pushing = false
let retryTimer: ReturnType<typeof setTimeout> | undefined
let attempt = 0

function scheduleRetry() {
  clearTimeout(retryTimer)
  const delay = Math.min(60_000, 1000 * 2 ** attempt) * (0.7 + Math.random() * 0.6)
  attempt = Math.min(attempt + 1, 6)
  setSync({ nextRetryAt: Date.now() + delay })
  retryTimer = setTimeout(() => void push(), delay)
}

export async function push(): Promise<void> {
  const sb = await getClient()
  const store = useStore.getState()
  if (!sb || pushing || !navigator.onLine || !store.sync.leader) return
  const keys = Object.keys(store.dirty)
  if (!keys.length) return
  pushing = true
  setSync({ status: 'syncing' })
  const rejected = new Set(store.sync.rejected)
  let sent = 0
  try {
    for (let i = 0; i < keys.length; i += 200) {
      const batch = keys.slice(i, i + 200)
      const rows: { collection: string; id: string; data: unknown; deleted: boolean; updated_at: string }[] = []
      for (const k of batch) {
        const sep = k.indexOf(':')
        const col = k.slice(0, sep) as CollectionName
        const id = k.slice(sep + 1)
        let doc = useStore.getState().data[col]?.[id] as Collections[CollectionName] | undefined
        if (!doc) continue
        if (col === 'photos') {
          const p = await uploadPhoto(sb, doc as Photo)
          const { dataUrl: _omit, ...rest } = p
          doc = rest as Photo
        }
        rows.push({ collection: col, id, data: doc, deleted: !!doc.deleted, updated_at: doc.updatedAt })
      }
      if (rows.length) {
        const { error } = await sb.from('documents').upsert(rows, { onConflict: 'collection,id' })
        if (error) {
          if (/JWT|token|auth/i.test(error.message)) throw new Error('La sesión de la nube expiró. Vuelve a vincular el dispositivo.')
          // Aísla filas que el rol no puede escribir (RLS) sin detener lo demás
          for (const row of rows) {
            const { error: e1 } = await sb.from('documents').upsert(row, { onConflict: 'collection,id' })
            if (e1) {
              if (/row-level security|permission|violates/i.test(e1.message)) rejected.add(`${row.collection}:${row.id}`)
              else throw e1
            }
          }
        }
      }
      sent += rows.length
      useStore.getState().clearDirty(batch)
    }
    attempt = 0
    clearTimeout(retryTimer)
    const now = new Date().toISOString()
    setSync({ status: 'idle', lastPushAt: now, lastSyncAt: now, error: undefined, nextRetryAt: undefined, pushed: useStore.getState().sync.pushed + sent, rejected: [...rejected].slice(-50) })
    if (sent) log('info', `Subidos ${sent} cambios`)
  } catch (e: any) {
    const msg = e?.message || String(e)
    setSync({ status: 'error', error: msg })
    log('error', `Error al subir: ${msg}`)
    scheduleRetry()
  } finally {
    pushing = false
  }
}

// ── Bajada ───────────────────────────────────────────────
let pulling = false
export async function pull(full = false): Promise<void> {
  const sb = await getClient()
  if (!sb || pulling || !navigator.onLine || !useStore.getState().sync.leader) return
  pulling = true
  if (full) localStorage.removeItem(LAST_PULL_KEY)
  let cursor = localStorage.getItem(LAST_PULL_KEY) || '1970-01-01T00:00:00Z'
  let received = 0
  const t0 = performance.now()
  try {
    for (let page = 0; page < 100; page++) {
      const { data, error } = await sb.from('documents').select('collection,id,data,updated_at').gt('updated_at', cursor).order('updated_at', { ascending: true }).limit(1000)
      if (page === 0) setSync({ latencyMs: Math.round(performance.now() - t0) })
      if (error) throw error
      if (!data?.length) break
      const byCol: Partial<Record<CollectionName, any[]>> = {}
      for (const row of data) if (COLLECTIONS.includes(row.collection)) (byCol[row.collection as CollectionName] ??= []).push(row.data)
      for (const [col, docs] of Object.entries(byCol)) useStore.getState().mergeRemote(col as CollectionName, docs as any)
      received += data.length
      cursor = data[data.length - 1]!.updated_at
      localStorage.setItem(LAST_PULL_KEY, cursor)
      if (data.length < 1000) break
    }
    const now = new Date().toISOString()
    setSync({ status: Object.keys(useStore.getState().dirty).length ? 'syncing' : 'idle', lastPullAt: now, lastSyncAt: now, error: undefined, pulled: useStore.getState().sync.pulled + received })
    if (received) log('info', `Recibidos ${received} cambios`)
  } catch (e: any) {
    setSync({ status: 'error', error: e?.message || String(e) })
    log('error', `Error al recibir: ${e?.message || e}`)
  } finally {
    pulling = false
  }
}

/** Marca todo como pendiente y lo sube (primera carga a una nube vacía). */
export async function uploadAll() {
  const s = useStore.getState()
  s.replaceAll(s.data)
  await push()
}

// ── Presencia del equipo ─────────────────────────────────
export interface PresenceUser {
  userId: string
  name: string
  role: Role
  page: string
  device: 'móvil' | 'tablet' | 'computadora'
  since: string
}
export const usePresence = create<{ users: PresenceUser[] }>(() => ({ users: [] }))

const deviceKind = (): PresenceUser['device'] => (window.innerWidth < 768 ? 'móvil' : window.innerWidth < 1100 ? 'tablet' : 'computadora')

let presenceChannel: RealtimeChannel | null = null
export function trackPage(page: string) {
  const me = useStore.getState().session.userId
  const emp = me ? useStore.getState().data.employees[me] : undefined
  if (!presenceChannel || !emp) return
  void presenceChannel.track({ userId: emp.id, name: emp.name, role: emp.role, page, device: deviceKind(), since: new Date().toISOString() } satisfies PresenceUser)
}

// ── Ciclo de vida ────────────────────────────────────────
let stopFn: (() => void) | null = null

async function bootEngine(isDisposed: () => boolean, onChannel: (c: RealtimeChannel[]) => void) {
  const sb = await getClient()
  if (!sb) {
    setSync({ status: 'local', realtime: 'off', error: undefined })
    return
  }
  const { data } = await sb.auth.getSession()
  if (!data.session) {
    setSync({ status: 'error', realtime: 'off', error: 'Este dispositivo no está vinculado. Ve a Ajustes → Nube.' })
    return
  }
  if (isDisposed()) return
  await pull()
  await push()
  setSync({ realtime: 'connecting' })
  const feed = sb
    .channel('documents-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, (payload: any) => {
      const row = payload.new
      if (row?.collection && COLLECTIONS.includes(row.collection)) {
        useStore.getState().mergeRemote(row.collection, [row.data])
        if (row.updated_at && row.updated_at > (localStorage.getItem(LAST_PULL_KEY) || '')) localStorage.setItem(LAST_PULL_KEY, row.updated_at)
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setSync({ realtime: 'live' })
        void pull() // recupera lo que pasó mientras estaba desconectado
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setSync({ realtime: 'error' })
        log('warn', 'Tiempo real interrumpido; reconectando')
      } else if (status === 'CLOSED') setSync({ realtime: 'off' })
    })

  presenceChannel = sb.channel('presencia', { config: { presence: { key: useStore.getState().session.userId || 'anon' } } })
  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const state = presenceChannel!.presenceState<PresenceUser>()
      const users = Object.values(state)
        .map((arr) => arr[0])
        .filter(Boolean) as PresenceUser[]
      usePresence.setState({ users })
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') trackPage(location.pathname)
    })
  onChannel([feed, presenceChannel])
}

export function startSync(): () => void {
  stopFn?.()
  let disposed = false
  let channels: RealtimeChannel[] = []
  let pushTimer: ReturnType<typeof setTimeout> | undefined
  let releaseLock: (() => void) | null = null

  const schedulePush = () => {
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => void push(), 900)
  }
  const becomeLeader = () => {
    if (disposed) return
    setSync({ leader: true })
    void bootEngine(
      () => disposed,
      (c) => (channels = c),
    )
  }

  // Elección de líder entre pestañas (Web Locks). Sin soporte: cada pestaña es líder.
  if ('locks' in navigator && useStore.getState().settings.supabaseUrl) {
    setSync({ leader: false, status: 'follower' })
    void navigator.locks.request('lajoya-sync-leader', () => {
      becomeLeader()
      return new Promise<void>((resolve) => (releaseLock = resolve))
    })
  } else becomeLeader()

  const offChange = onLocalChange(schedulePush)
  const onOnline = () => {
    attempt = 0
    void pull()
    void push()
  }
  const onVisible = () => document.visibilityState === 'visible' && onOnline()
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  const iv = setInterval(() => void pull(), 45_000)

  stopFn = () => {
    disposed = true
    offChange()
    clearTimeout(pushTimer)
    clearTimeout(retryTimer)
    clearInterval(iv)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    if (client) for (const c of channels) void client.removeChannel(c)
    presenceChannel = null
    usePresence.setState({ users: [] })
    releaseLock?.()
    setSync({ realtime: 'off' })
  }
  return () => stopFn?.()
}

export function restartSync() {
  startSync()
}

// ── Fotos: URL local o firmada ───────────────────────────
const signedCache = new Map<string, { url: string; exp: number }>()
export async function photoUrl(photo: Photo | undefined): Promise<string | undefined> {
  if (!photo) return undefined
  if (photo.dataUrl) return photo.dataUrl
  if (!photo.storagePath) return undefined
  const hit = signedCache.get(photo.storagePath)
  if (hit && hit.exp > Date.now()) return hit.url
  const sb = await getClient()
  if (!sb) return undefined
  const { data } = await sb.storage.from('fotos').createSignedUrl(photo.storagePath, 3600)
  if (data?.signedUrl) signedCache.set(photo.storagePath, { url: data.signedUrl, exp: Date.now() + 3500_000 })
  return data?.signedUrl
}

export function usePhotoUrl(photo: Photo | undefined) {
  const [url, setUrl] = useState<string | undefined>(photo?.dataUrl)
  useEffect(() => {
    let alive = true
    void photoUrl(photo).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [photo?.id, photo?.dataUrl, photo?.storagePath])
  return url
}

// ── Estado de red real (no solo navigator.onLine) ────────
export function useNetwork() {
  const [online, setOnline] = useState(navigator.onLine)
  const [type, setType] = useState<string | undefined>((navigator as any).connection?.effectiveType)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    const conn = (navigator as any).connection
    const onConn = () => setType(conn?.effectiveType)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    conn?.addEventListener?.('change', onConn)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      conn?.removeEventListener?.('change', onConn)
    }
  }, [])
  return { online, type }
}

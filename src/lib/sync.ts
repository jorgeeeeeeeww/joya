// Motor de sincronización offline-first con Supabase.
//
// Cómo funciona:
// - Todo se guarda primero en el dispositivo (store.ts). Aquí solo se sube y se baja.
// - Una sola pestaña por dispositivo es "líder" (Web Locks) y habla con la nube; las demás
//   reciben los cambios por BroadcastChannel. Así no hay trabajo duplicado ni carreras.
// - Subida: lotes de 200, reintentos con espera exponencial + aleatoria (1 s → 60 s), filas que el
//   rol no puede escribir (RLS) se aíslan y se reportan sin bloquear el resto.
// - Bajada: punto de avance por updated_at del servidor, guardado junto con los datos en una sola
//   operación. Cada bajada lee con un margen hacia atrás (dos subidas pueden terminar en desorden);
//   leer dos veces lo mismo no duplica nada.
// - Tiempo real: Broadcast privado. La base solo avisa «hubo cambios» y cada dispositivo baja lo
//   nuevo con sus propios permisos. El pulso de conexión va en un hilo aparte (iPhone lo congela si no).
// - Todas las peticiones tienen tiempo límite: con señal débil nada se queda trabado para siempre.
// - Conflictos: combinación campo por campo (cliente y servidor, ver trigger documents_lww).
// - Presencia: quién del equipo está conectado y en qué sección.
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { emptyData, flushNow, getPullCursor, onLocalChange, setPullCursor, useStore } from './store'
import type { CollectionName, Collections, Photo, Role } from './types'
import { COLLECTIONS } from './types'
import { logError } from './errorLog'
import { BUILD_ID, isOlder, useVersion } from './version'
import { BAKED_KEY, BAKED_URL, isJwtKey } from './cloudConfig'
import { flushErrors, reportDevice, resetDeviceId } from './monitor'

let client: SupabaseClient | null = null
let clientKey = ''

/** Tiempo límite de cada petición: con señal débil en el rancho, nada se queda esperando para siempre */
const REQUEST_TIMEOUT_MS = 20_000
const UPLOAD_TIMEOUT_MS = 90_000
/** Margen hacia atrás de cada bajada (cambios que se guardaron en desorden en el servidor) */
const PULL_OVERLAP_MS = 60_000

const urlOf = (input: RequestInfo | URL) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)

/** fetch con tiempo límite (respeta también la cancelación de quien llama) */
export function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = urlOf(input)
  const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()
  const ms = method !== 'GET' && method !== 'HEAD' && url.includes('/storage/v1/object/') ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('La conexión tardó demasiado (timeout)', 'TimeoutError')), ms)
  const outer = init?.signal
  if (outer) {
    if (outer.aborted) ctrl.abort(outer.reason)
    else outer.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true })
  }
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

export async function getClient(): Promise<SupabaseClient | null> {
  const { supabaseUrl, supabaseAnonKey } = useStore.getState().settings
  if (!supabaseUrl || !supabaseAnonKey) return null
  const key = supabaseUrl + supabaseAnonKey
  if (client && clientKey === key) return client
  const { createClient } = await import('@supabase/supabase-js')
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'lajoya-auth' },
    global: { fetch: timedFetch },
    realtime: {
      params: { eventsPerSecond: 20 },
      // El pulso de conexión en un hilo aparte: iPhone congela los temporizadores de la página en segundo plano
      worker: true,
      heartbeatCallback: (status) => {
        if (status === 'disconnected' || status === 'timeout') {
          setSync({ realtime: 'error' })
          scheduleRealtimeReconnect()
        } else if (status === 'ok') lastHeartbeatOk = Date.now()
      },
    },
  })
  clientKey = key
  return client
}

const log = (level: 'info' | 'warn' | 'error', msg: string) => useStore.getState().syncLog(level, msg)
const setSync = (s: Parameters<ReturnType<typeof useStore.getState>['setSync']>[0]) => useStore.getState().setSync(s)

// ── Sesión de la nube ────────────────────────────────────
const SESSION_EXPIRED = 'La sesión de este dispositivo en la nube venció. Entra de nuevo con tu correo en Ajustes → Nube; no se pierde nada.'
const isAuthError = (msg: string) => /jwt|token.*(expired|invalid)|invalid.*token|not authenticated|401/i.test(msg)

/**
 * Antes de pedir que se vuelva a vincular, se intenta renovar la sesión (iPhone congela la renovación
 * automática en segundo plano). Devuelve 'ok', 'offline' (no hubo red para renovar) o 'expired'.
 */
async function renewSession(sb: SupabaseClient): Promise<'ok' | 'offline' | 'expired'> {
  try {
    const { data, error } = await sb.auth.refreshSession()
    if (!error && data.session) {
      log('info', 'Sesión de la nube renovada')
      return 'ok'
    }
    if (error && (error.name === 'AuthRetryableFetchError' || (error as { status?: number }).status === 0)) return 'offline'
    return 'expired'
  } catch {
    return 'offline'
  }
}

// ── Diagnóstico ──────────────────────────────────────────
export interface CheckResult {
  key: string
  label: string
  ok: boolean | null
  detail?: string
}

/** Encabezados para hablar con la nube sin sesión: las llaves nuevas (sb_publishable_…) no van en Authorization */
const keyHeaders = (key: string): Record<string, string> => (isJwtKey(key) ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key })

/** Prueba la conexión antes de iniciar sesión (servidor, API y autenticación). */
export async function testConnection(url: string, anonKey: string): Promise<{ checks: CheckResult[]; latencyMs?: number }> {
  const base = url.trim().replace(/\/$/, '')
  const checks: CheckResult[] = []
  const headers = keyHeaders(anonKey.trim())
  const t0 = performance.now()
  try {
    const r = await fetch(`${base}/auth/v1/health`, { headers, signal: AbortSignal.timeout(8000) })
    const latencyMs = Math.round(performance.now() - t0)
    checks.push({ key: 'server', label: 'El servidor responde', ok: r.ok, detail: r.ok ? `${latencyMs} ms` : r.status === 401 ? 'La llave pública no es de este proyecto' : `HTTP ${r.status}` })
    const rest = await fetch(`${base}/rest/v1/documents?select=id&limit=1`, { headers, signal: AbortSignal.timeout(8000) })
    checks.push({
      key: 'schema',
      label: 'Base de datos lista',
      ok: rest.ok || rest.status === 401 || rest.status === 403,
      detail: rest.status === 404 ? 'Falta aplicar las migraciones' : rest.ok ? 'Tabla documents encontrada' : rest.status === 401 || rest.status === 403 ? 'Protegida (correcto)' : `HTTP ${rest.status}`,
    })
    checks.push({ key: 'https', label: 'Conexión cifrada', ok: base.startsWith('https://') || /localhost|127\.0\.0\.1|\.local|192\.168\./.test(base), detail: base.startsWith('https://') ? 'HTTPS/TLS' : 'Red local' })
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
  const out: CheckResult[] = [{ key: 'config', label: 'Conexión configurada', ok: true, detail: isJwtKey(useStore.getState().settings.supabaseAnonKey ?? '') ? 'Llave anterior (anon): cámbiala por la nueva sb_publishable_…' : 'Llave pública nueva' }]
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
  out.push({ key: 'realtime', label: 'Tiempo real', ok: useStore.getState().sync.realtime === 'live', detail: useStore.getState().sync.realtime === 'live' ? 'Escuchando cambios (Broadcast privado)' : 'Conectando…' })
  const required = useVersion.getState()
  out.push({ key: 'version', label: 'Versión de la app', ok: !required.required, detail: required.required ? 'La nube pide una versión más nueva; se actualiza sola' : 'Al día' })
  out.push({ key: 'latency', label: 'Latencia', ok: latency < 800, detail: `${latency} ms` })
  return out
}

/** Vincula este dispositivo con una cuenta del equipo (una vez por dispositivo). */
export async function connectCloud(url: string, anonKey: string, email: string, password: string) {
  const prevUrl = useStore.getState().settings.supabaseUrl
  useStore.getState().setSettings({ supabaseUrl: url.trim().replace(/\/$/, ''), supabaseAnonKey: anonKey.trim() })
  const sb = await getClient()
  if (!sb) throw new Error('Faltan datos de conexión')
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
  if (error) {
    // Sin vincular: se deja como estaba (así la pantalla de entrada vuelve a pedir el correo)
    if (!prevUrl) useStore.getState().setSettings({ supabaseUrl: undefined, supabaseAnonKey: undefined })
    if (error.name === 'AuthRetryableFetchError') throw new Error('No hay conexión con la nube. Revisa el internet e intenta de nuevo.')
    throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : error.message)
  }
  const { data: profile, error: pErr } = await sb.from('profiles').select('role, employee_id').maybeSingle()
  if (pErr || !profile) {
    await sb.auth.signOut().catch(() => {})
    if (!prevUrl) useStore.getState().setSettings({ supabaseUrl: undefined, supabaseAnonKey: undefined })
    throw new Error('La cuenta no tiene puesto asignado. Pide al dueño que la agregue en Supabase (tabla profiles).')
  }
  log('info', `Dispositivo vinculado como ${profile.role}`)
  useStore.getState().setSettings({ cloudRole: profile.role as Role, cloudEmployeeId: profile.employee_id ?? undefined, cloudEmail: email.trim().toLowerCase() })
  resetDeviceId()
  // Primer vínculo de este dispositivo: si la nube ya tiene datos, se usan esos y se descartan los de ejemplo
  // de este equipo (si no, aparecerían casas, eventos y personas duplicadas)
  if (!getPullCursor()) {
    const { count } = await sb.from('documents').select('id', { count: 'exact', head: true })
    if (count && count > 0) {
      useStore.getState().replaceAll(emptyData())
      useStore.getState().clearDirty(Object.keys(useStore.getState().dirty))
      useStore.getState().logout()
      log('info', `La nube ya tiene ${count} registros: este dispositivo usará esos`)
    }
  }
  restartSync()
  return profile as { role: string; employee_id: string | null }
}

export async function disconnectCloud() {
  const sb = await getClient()
  await sb?.auth.signOut().catch(() => {})
  useStore.getState().setSettings({ supabaseUrl: undefined, supabaseAnonKey: undefined, cloudRole: undefined, cloudEmployeeId: undefined, cloudEmail: undefined })
  setPullCursor('')
  await flushNow()
  log('info', 'Dispositivo desvinculado')
  restartSync()
}

/** Dirección y llave para vincular: las que vienen dentro de la app publicada, o las de un QR */
export function bakedOrLinked(): { u: string; k: string } | null {
  if (BAKED_URL && BAKED_KEY) return { u: BAKED_URL, k: BAKED_KEY }
  return pendingLink()
}

// ── Enlace / QR para vincular otro dispositivo ───────────
export function buildLinkUrl() {
  const { supabaseUrl, supabaseAnonKey } = useStore.getState().settings
  if (!supabaseUrl || !supabaseAnonKey) return null
  // La app publicada ya trae la dirección: el enlace solo abre la app
  if (BAKED_URL && supabaseUrl === BAKED_URL) return `${location.origin}/`
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

// ── Versión mínima que exige la nube ─────────────────────
let minCheckedAt = 0
/** ¿Esta versión puede subir cambios? (si cambió el formato de los datos, primero hay que actualizar) */
async function versionAllowsPush(sb: SupabaseClient): Promise<boolean> {
  if (Date.now() - minCheckedAt < 5 * 60_000) return !useVersion.getState().required
  const { data, error } = await sb.from('app_config').select('value').eq('key', 'min_build').maybeSingle()
  // Sin la tabla (nube todavía sin esta migración) o sin red: no se bloquea nada
  if (error) return !useVersion.getState().required
  minCheckedAt = Date.now()
  const min = typeof data?.value === 'string' ? data.value.trim() : undefined
  const required = !!min && isOlder(BUILD_ID, min)
  if (required !== useVersion.getState().required) {
    useVersion.setState({ required, minBuild: min })
    if (required) log('warn', 'La nube pide una versión más nueva de la app: se actualiza antes de subir cambios')
  }
  return !required
}

// ── Fotos ────────────────────────────────────────────────
async function uploadPhoto(sb: SupabaseClient, photo: Photo): Promise<Photo> {
  if (!photo.dataUrl || photo.storagePath) return photo
  const blob = await (await fetch(photo.dataUrl)).blob()
  const path = `${photo.id}.jpg`
  const { error } = await sb.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
  useStore.getState().patch('photos', photo.id, { storagePath: path }, { silent: true })
  void rememberPhoto(path, blob)
  return { ...photo, storagePath: path }
}

/** Error de la nube que no se arregla reintentando (permiso, archivo muy grande, formato) */
const isPermanent = (e: unknown) => {
  const status = Number((e as { statusCode?: string | number; status?: number })?.statusCode ?? (e as { status?: number })?.status)
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429
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

type Row = { collection: string; id: string; data: unknown; deleted: boolean; updated_at: string }

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
  let renewed = false
  try {
    if (!(await versionAllowsPush(sb))) {
      setSync({ status: 'error', error: 'Hay que actualizar la app antes de subir cambios. Se actualiza sola en un momento; tus cambios están guardados aquí.' })
      return
    }
    for (let i = 0; i < keys.length; i += 200) {
      const batch = keys.slice(i, i + 200)
      const rows: Row[] = []
      // Versión que se envió de cada documento: si alguien lo edita mientras se sube, no se borra su marca
      const sentVersion = new Map<string, string>()
      for (const k of batch) {
        const sep = k.indexOf(':')
        const col = k.slice(0, sep) as CollectionName
        const id = k.slice(sep + 1)
        let doc = useStore.getState().data[col]?.[id] as Collections[CollectionName] | undefined
        if (!doc) continue
        if (col === 'photos') {
          try {
            const p = await uploadPhoto(sb, doc as Photo)
            const { dataUrl: _omit, ...rest } = p
            doc = rest as Photo
          } catch (e) {
            // Una foto que la nube no acepta (muy grande, formato) no detiene el resto de los cambios
            if (!isPermanent(e)) throw e
            rejected.add(k)
            logError('permiso', `La nube no aceptó una foto: ${(e as Error)?.message ?? e}`)
            continue
          }
        }
        sentVersion.set(k, doc.updatedAt)
        rows.push({ collection: col, id, data: doc, deleted: !!doc.deleted, updated_at: doc.updatedAt })
      }
      if (rows.length) {
        let { error } = await sb.from('documents').upsert(rows, { onConflict: 'collection,id' })
        // Sesión vencida: primero se renueva y se reintenta; solo si no se puede, se pide entrar de nuevo
        if (error && isAuthError(error.message) && !renewed) {
          renewed = true
          const r = await renewSession(sb)
          if (r === 'expired') throw new Error(SESSION_EXPIRED)
          if (r === 'offline') throw new Error('Sin conexión para renovar la sesión; se reintenta solo')
          ;({ error } = await sb.from('documents').upsert(rows, { onConflict: 'collection,id' }))
        }
        if (error) {
          if (isAuthError(error.message)) throw new Error(SESSION_EXPIRED)
          // Aísla filas que el rol no puede escribir (RLS) sin detener lo demás
          let denied = 0
          for (const row of rows) {
            const { error: e1 } = await sb.from('documents').upsert(row, { onConflict: 'collection,id' })
            if (e1) {
              if (/row-level security|permission|violates|42501/i.test(e1.message + (e1.code ?? ''))) {
                rejected.add(`${row.collection}:${row.id}`)
                denied++
              } else throw e1
            }
          }
          if (denied) logError('permiso', `La nube rechazó ${denied} ${denied === 1 ? 'cambio' : 'cambios'} por permisos del puesto`)
        }
      }
      sent += rows.length
      const now = useStore.getState().data
      useStore.getState().clearDirty(
        batch.filter((k) => {
          const sep = k.indexOf(':')
          const cur = now[k.slice(0, sep) as CollectionName]?.[k.slice(sep + 1)] as { updatedAt?: string } | undefined
          // Se limpia si no cambió desde que se envió (o ya no existe, o la nube lo rechazó para siempre);
          // si cambió, se sube en la siguiente vuelta
          return !cur || rejected.has(k) || !sentVersion.has(k) || cur.updatedAt === sentVersion.get(k)
        }),
      )
    }
    attempt = 0
    clearTimeout(retryTimer)
    const now = new Date().toISOString()
    setSync({ status: 'idle', lastPushAt: now, lastSyncAt: now, error: undefined, nextRetryAt: undefined, pushed: useStore.getState().sync.pushed + sent, rejected: [...rejected].slice(-50) })
    if (sent) log('info', `Subidos ${sent} cambios`)
    if (Object.keys(useStore.getState().dirty).length) setTimeout(() => void push(), 400)
    afterSync(sb)
  } catch (e: any) {
    const msg = e?.message || String(e)
    setSync({ status: 'error', error: msg })
    log('error', `Error al subir: ${msg}`)
    // Con la sesión vencida no tiene caso reintentar cada minuto: se espera a que la persona entre de nuevo
    if (msg !== SESSION_EXPIRED) scheduleRetry()
  } finally {
    pushing = false
  }
}

// ── Bajada ───────────────────────────────────────────────
let pulling = false
let pullAgain = false
let pullRetryTimer: ReturnType<typeof setTimeout> | undefined
let pullAttempt = 0
let pullDebounce: ReturnType<typeof setTimeout> | undefined

/** Pide una bajada pronto (varios avisos seguidos se juntan en una sola) */
function schedulePull(ms = 250) {
  clearTimeout(pullDebounce)
  pullDebounce = setTimeout(() => void pull(), ms)
}

const EPOCH = '1970-01-01T00:00:00Z'
/** Resta el margen al punto de avance (los cambios que se guardaron en desorden se vuelven a leer) */
function withOverlap(cursor: string): string {
  const t = Date.parse(cursor)
  return cursor && Number.isFinite(t) ? new Date(Math.max(0, t - PULL_OVERLAP_MS)).toISOString() : EPOCH
}

export async function pull(full = false): Promise<void> {
  const sb = await getClient()
  if (!sb || !navigator.onLine || !useStore.getState().sync.leader) return
  if (pulling) {
    // Llegó un aviso mientras se bajaba: se baja otra vez al terminar
    pullAgain = true
    return
  }
  pulling = true
  if (full) setPullCursor('')
  const start = getPullCursor()
  let since = withOverlap(start)
  let newest = start
  let received = 0
  let renewed = false
  const t0 = performance.now()
  try {
    for (let page = 0; page < 200; page++) {
      const query = () => sb.from('documents').select('collection,id,data,updated_at').gt('updated_at', since).order('updated_at', { ascending: true }).limit(1000)
      let { data, error } = await query()
      if (page === 0) setSync({ latencyMs: Math.round(performance.now() - t0) })
      // Sesión vencida: primero se renueva y se reintenta; solo si no se puede, se pide entrar de nuevo
      if (error && isAuthError(error.message) && !renewed) {
        renewed = true
        const r = await renewSession(sb)
        if (r === 'expired') throw new Error(SESSION_EXPIRED)
        if (r === 'offline') throw new Error('Sin conexión para renovar la sesión; se reintenta solo')
        ;({ data, error } = await query())
      }
      if (error) throw isAuthError(error.message) ? new Error(SESSION_EXPIRED) : error
      if (!data?.length) break
      const byCol: Partial<Record<CollectionName, any[]>> = {}
      for (const row of data) if (COLLECTIONS.includes(row.collection)) (byCol[row.collection as CollectionName] ??= []).push(row.data)
      for (const [col, docs] of Object.entries(byCol)) useStore.getState().mergeRemote(col as CollectionName, docs as any)
      received += data.length
      const last = data[data.length - 1]!.updated_at as string
      if (!newest || Date.parse(last) >= Date.parse(newest)) newest = last
      // Datos y punto de avance se guardan juntos, en una sola operación, antes de seguir
      setPullCursor(newest)
      await flushNow()
      // La siguiente página sigue exactamente donde terminó esta (el margen solo se usa al empezar)
      since = last
      if (data.length < 1000) break
    }
    pullAttempt = 0
    clearTimeout(pullRetryTimer)
    const now = new Date().toISOString()
    setSync({ status: Object.keys(useStore.getState().dirty).length ? 'syncing' : 'idle', lastPullAt: now, lastSyncAt: now, error: undefined, pulled: useStore.getState().sync.pulled + received })
    if (received && newest !== start) log('info', `Recibidos ${received} cambios`)
    afterSync(sb)
  } catch (e: any) {
    const msg = e?.message || String(e)
    setSync({ status: 'error', error: msg })
    log('error', `Error al recibir: ${msg}`)
    if (msg !== SESSION_EXPIRED) {
      clearTimeout(pullRetryTimer)
      pullRetryTimer = setTimeout(() => void pull(), Math.min(60_000, 3000 * 2 ** pullAttempt))
      pullAttempt = Math.min(pullAttempt + 1, 5)
    }
  } finally {
    pulling = false
    if (pullAgain) {
      pullAgain = false
      schedulePull(50)
    }
  }
}

/** Sube y baja todo ahora (botón «Sincronizar ahora» y deslizar hacia abajo) */
export async function syncNow() {
  attempt = 0
  await pull()
  await push()
}

/** Marca todo como pendiente y lo sube (primera carga a una nube vacía). */
export async function uploadAll() {
  const s = useStore.getState()
  s.replaceAll(s.data)
  await push()
}

/** Después de cada sincronización: estado del dispositivo y errores pendientes al monitor central */
function afterSync(sb: SupabaseClient) {
  void reportDevice(sb).catch(() => {})
  void flushErrors(sb).catch(() => {})
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

// ── Tiempo real ──────────────────────────────────────────
let feedChannel: RealtimeChannel | null = null
let lastHeartbeatOk = 0
let realtimeTimer: ReturnType<typeof setTimeout> | undefined
let realtimeAttempt = 0
let engineAlive = false

function scheduleRealtimeReconnect() {
  if (!engineAlive) return
  clearTimeout(realtimeTimer)
  const delay = Math.min(30_000, 1000 * 2 ** realtimeAttempt)
  realtimeAttempt = Math.min(realtimeAttempt + 1, 5)
  realtimeTimer = setTimeout(() => void connectRealtime(), delay)
}

async function disconnectRealtime() {
  const sb = client
  const chans = [feedChannel, presenceChannel].filter(Boolean) as RealtimeChannel[]
  feedChannel = null
  presenceChannel = null
  if (sb) for (const c of chans) await sb.removeChannel(c).catch(() => {})
}

/** Conecta (o reconecta) el aviso de cambios y la presencia. Seguro de llamar varias veces. */
async function connectRealtime() {
  const sb = await getClient()
  if (!sb || !engineAlive) return
  await disconnectRealtime()
  setSync({ realtime: 'connecting' })
  try {
    // Los canales privados usan la sesión de la persona: la base decide quién puede escucharlos
    await sb.realtime.setAuth()
  } catch {
    /* se reintenta con la reconexión */
  }
  const me = useStore.getState().session.userId || 'anon'
  feedChannel = sb
    .channel('documentos', { config: { private: true } })
    .on('broadcast', { event: 'cambio' }, () => schedulePull())
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        realtimeAttempt = 0
        lastHeartbeatOk = Date.now()
        setSync({ realtime: 'live' })
        schedulePull(50) // recupera lo que pasó mientras estaba desconectado
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setSync({ realtime: 'error' })
        log('warn', 'Tiempo real interrumpido; reconectando')
        scheduleRealtimeReconnect()
      } else if (status === 'CLOSED') setSync({ realtime: 'off' })
    })

  const pc = sb.channel('presencia', { config: { private: true, presence: { key: me } } })
  presenceChannel = pc
  pc.on('presence', { event: 'sync' }, () => {
    const state = pc.presenceState<PresenceUser>()
    const all = Object.values(state)
      .map((arr) => arr[0])
      .filter(Boolean) as PresenceUser[]
    // La misma persona abierta en dos dispositivos cuenta una sola vez
    const users = [...new Map(all.map((u) => [u.userId, u])).values()]
    usePresence.setState({ users })
  }).subscribe((status) => {
    if (status === 'SUBSCRIBED') trackPage(location.pathname)
  })
}

/** Al volver a la app: si el tiempo real se cayó en silencio (iPhone), se reconecta */
function ensureRealtime() {
  const joined = feedChannel?.state === 'joined'
  const stale = Date.now() - lastHeartbeatOk > 90_000
  if (!joined || stale) {
    realtimeAttempt = 0
    void connectRealtime()
  }
}

// ── Ciclo de vida ────────────────────────────────────────
let stopFn: (() => void) | null = null

async function bootEngine(isDisposed: () => boolean) {
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
  if (isDisposed()) return
  engineAlive = true
  await connectRealtime()
}

export function startSync(): () => void {
  stopFn?.()
  let disposed = false
  let pushTimer: ReturnType<typeof setTimeout> | undefined
  let releaseLock: (() => void) | null = null

  const schedulePush = () => {
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => void push(), 900)
  }
  const becomeLeader = () => {
    if (disposed) return
    setSync({ leader: true })
    void bootEngine(() => disposed)
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
  // Alguien entró o salió con su PIN: el monitor central lo sabe al momento
  const offSession = useStore.subscribe((s, prev) => {
    if (s.session.userId !== prev.session.userId && client && s.sync.leader) void reportDevice(client, true).catch(() => {})
  })
  const onOnline = () => {
    attempt = 0
    pullAttempt = 0
    // Al volver a la app se revisa otra vez la versión mínima (el dueño pudo exigir una nueva)
    minCheckedAt = 0
    void pull()
    void push()
    if (engineAlive) ensureRealtime()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') onOnline()
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', onVisible)
  const iv = setInterval(() => void pull(), 45_000)

  stopFn = () => {
    disposed = true
    engineAlive = false
    offChange()
    offSession()
    clearTimeout(pushTimer)
    clearTimeout(retryTimer)
    clearTimeout(pullRetryTimer)
    clearTimeout(pullDebounce)
    clearTimeout(realtimeTimer)
    clearInterval(iv)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pageshow', onVisible)
    void disconnectRealtime()
    usePresence.setState({ users: [] })
    releaseLock?.()
    setSync({ realtime: 'off' })
  }
  return () => stopFn?.()
}

export function restartSync() {
  startSync()
}

// ── Fotos: original local, guardada en el dispositivo o firmada ──
// Cada foto que se ve una vez queda guardada en el dispositivo: después se ve sin internet.
const PHOTO_CACHE = 'fotos-vistas'
const PHOTO_CACHE_MAX = 400
const objectUrls = new Map<string, string>()
const photoKey = (path: string) => `${location.origin}/__fotos/${encodeURIComponent(path)}`

async function rememberPhoto(path: string, blob: Blob) {
  try {
    if (!('caches' in window)) return
    const cache = await caches.open(PHOTO_CACHE)
    await cache.put(photoKey(path), new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } }))
    const keys = await cache.keys()
    // Las más viejas se van primero (el orden de las llaves es el de guardado)
    for (const old of keys.slice(0, Math.max(0, keys.length - PHOTO_CACHE_MAX))) await cache.delete(old)
  } catch {
    /* sin espacio o sin Cache Storage: la foto se sigue viendo con internet */
  }
}

async function cachedPhoto(path: string): Promise<string | undefined> {
  const mem = objectUrls.get(path)
  if (mem) return mem
  try {
    if (!('caches' in window)) return undefined
    const hit = await (await caches.open(PHOTO_CACHE)).match(photoKey(path))
    if (!hit) return undefined
    const url = URL.createObjectURL(await hit.blob())
    objectUrls.set(path, url)
    return url
  } catch {
    return undefined
  }
}

const signedCache = new Map<string, { url: string; exp: number }>()
export async function photoUrl(photo: Photo | undefined): Promise<string | undefined> {
  if (!photo) return undefined
  if (photo.dataUrl) return photo.dataUrl
  if (!photo.storagePath) return undefined
  const path = photo.storagePath
  const local = await cachedPhoto(path)
  if (local) return local
  const hit = signedCache.get(path)
  let signed = hit && hit.exp > Date.now() ? hit.url : undefined
  if (!signed) {
    const sb = await getClient()
    if (!sb) return undefined
    const { data } = await sb.storage.from('fotos').createSignedUrl(path, 3600)
    if (!data?.signedUrl) return undefined
    signed = data.signedUrl
    signedCache.set(path, { url: signed, exp: Date.now() + 3500_000 })
  }
  // Se descarga una vez y se guarda; si no se puede, se muestra directo desde la nube
  try {
    const res = await timedFetch(signed)
    if (!res.ok) return signed
    const blob = await res.blob()
    void rememberPhoto(path, blob)
    const url = URL.createObjectURL(blob)
    objectUrls.set(path, url)
    return url
  } catch {
    return signed
  }
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

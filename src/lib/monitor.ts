// Monitor central: cada dispositivo manda a la nube su estado (versión, última sincronización, cambios
// pendientes) y sus errores. El dueño los ve todos juntos en «Dispositivos» y recibe avisos si algo falla.
// Nunca viajan datos del rancho: solo el error, la pantalla, la versión y el dispositivo.
import type { SupabaseClient } from '@supabase/supabase-js'
import { useStore } from './store'
import { dropSentErrors, pendingErrors } from './errorLog'
import { APP_VERSION, BUILD_ID } from './version'
import { uid } from './format'

const DEVICE_KEY = 'lajoya:dispositivo'
const REPORT_EVERY_MS = 2 * 60_000

export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = uid('dev_')
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return 'dev_sin_almacenamiento'
  }
}

/** Dispositivo vinculado a otra cuenta: se le da un número nuevo (la fila anterior es de la otra cuenta) */
export function resetDeviceId() {
  try {
    localStorage.removeItem(DEVICE_KEY)
  } catch {
    /* sin almacenamiento */
  }
  lastReport = 0
}

/** «iPhone · app instalada», «Android · navegador», «Mac», etc. */
export function platformLabel(): string {
  const ua = navigator.userAgent
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : 'Otro'
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  return `${os} · ${standalone ? 'app instalada' : 'navegador'}`
}

let lastReport = 0
let reporting = false
/** Manda el estado de este dispositivo (como mucho cada 2 minutos, o antes si hay algo que avisar) */
export async function reportDevice(sb: SupabaseClient, force = false) {
  const s = useStore.getState()
  const pending = Object.keys(s.dirty).length
  const urgent = s.sync.status === 'error' || s.sync.rejected.length > 0
  if (reporting || (!force && !urgent && Date.now() - lastReport < REPORT_EVERY_MS)) return
  if (!force && urgent && Date.now() - lastReport < 30_000) return
  reporting = true
  try {
    const me = s.session.userId ? s.data.employees[s.session.userId] : undefined
    let storageMb: number | null = null
    try {
      const est = await navigator.storage?.estimate?.()
      if (est?.usage != null) storageMb = Math.round((est.usage / 1024 / 1024) * 10) / 10
    } catch {
      /* sin dato */
    }
    const row = {
      device_id: deviceId(),
      employee_id: me?.id ?? null,
      employee_name: me?.name ?? null,
      employee_role: me?.role ?? s.settings.cloudRole ?? null,
      app_build: BUILD_ID,
      app_version: APP_VERSION,
      platform: platformLabel(),
      last_sync_at: s.sync.lastSyncAt ?? null,
      pending_count: pending,
      rejected_count: s.sync.rejected.length,
      sync_status: s.sync.status,
      sync_error: s.sync.error?.slice(0, 300) ?? null,
      realtime: s.sync.realtime,
      storage_mb: storageMb,
    }
    let { error } = await sb.from('devices').upsert(row, { onConflict: 'device_id' })
    // La fila es de otra cuenta (este dispositivo se volvió a vincular): número nuevo y se reintenta
    if (error && /row-level security|42501|permission/i.test(error.message + (error.code ?? ''))) {
      resetDeviceId()
      ;({ error } = await sb.from('devices').upsert({ ...row, device_id: deviceId() }, { onConflict: 'device_id' }))
    }
    if (!error) lastReport = Date.now()
  } finally {
    reporting = false
  }
}

let flushing = false
/** Manda los errores pendientes al monitor central (de 50 en 50). Si falla, se quedan para la próxima. */
export async function flushErrors(sb: SupabaseClient) {
  if (flushing) return
  const list = pendingErrors()
  if (!list.length) return
  flushing = true
  try {
    const s = useStore.getState()
    const me = s.session.userId ? s.data.employees[s.session.userId] : undefined
    const batch = list.slice(0, 50)
    const { error } = await sb.from('client_errors').insert(
      batch.map((e) => ({
        device_id: deviceId(),
        employee_id: me?.id ?? null,
        employee_role: me?.role ?? s.settings.cloudRole ?? null,
        app_build: BUILD_ID,
        page: e.page?.slice(0, 200) ?? null,
        source: e.source,
        message: e.message.slice(0, 400),
        detail: e.detail?.slice(0, 1200) ?? null,
        happened_at: e.at,
      })),
    )
    // Los errores al mandar errores no se registran: así nunca se forma un ciclo
    if (!error) dropSentErrors(batch.length)
  } finally {
    flushing = false
  }
}

// ── Lectura para el dueño (vista «Dispositivos») ─────────
export interface DeviceRow {
  device_id: string
  employee_id: string | null
  employee_name: string | null
  employee_role: string | null
  account_email: string | null
  app_build: string
  app_version: string | null
  platform: string | null
  last_seen: string
  last_sync_at: string | null
  pending_count: number
  rejected_count: number
  sync_status: string | null
  sync_error: string | null
  realtime: string | null
  storage_mb: number | null
  version_since: string | null
  errors_24h: number
  health: 'verde' | 'amarillo' | 'rojo'
  health_reason: string | null
}

export interface ErrorGroup {
  fingerprint: string
  source: string
  sample_message: string
  sample_page: string | null
  occurrences: number
  devices: number
  first_seen: string
  last_seen: string
}

export interface BackendRun {
  job: string
  label: string
  ok: boolean
  last_run: string
  detail: string | null
}

export interface MonitorSnapshot {
  devices: DeviceRow[]
  groups: ErrorGroup[]
  backend: BackendRun[]
  latestBuild?: string
  minBuild?: string
}

export async function loadMonitor(sb: SupabaseClient): Promise<MonitorSnapshot> {
  const [d, g, b, cfg] = await Promise.all([
    sb.from('device_health').select('*').order('last_seen', { ascending: false }).limit(200),
    sb.from('client_error_groups').select('*').order('last_seen', { ascending: false }).limit(60),
    sb.from('backend_runs').select('*').order('job'),
    sb.from('app_config').select('key,value').in('key', ['min_build', 'latest_build']),
  ])
  const err = d.error || g.error || b.error
  if (err) throw new Error(/does not exist|42P01|schema cache/i.test(err.message) ? 'Falta aplicar la migración del monitor en Supabase' : err.message)
  const conf = Object.fromEntries((cfg.data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
  return { devices: (d.data ?? []) as DeviceRow[], groups: (g.data ?? []) as ErrorGroup[], backend: (b.data ?? []) as BackendRun[], latestBuild: conf.latest_build, minBuild: conf.min_build }
}

/** El dueño pide a un dispositivo que se actualice: sube la versión mínima a la más nueva publicada */
export async function requireLatest(sb: SupabaseClient, build: string) {
  const { error } = await sb.from('app_config').upsert({ key: 'min_build', value: build })
  if (error) throw new Error(error.message)
}

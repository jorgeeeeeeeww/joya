// Almacén local-first de La Joya.
// - Cada cambio se guarda al instante en IndexedDB (por colección: rápido aunque haya fotos).
// - Cada campo lleva su propia marca de tiempo (_ft): dos personas pueden editar campos distintos
//   del mismo registro sin pisarse; si editan el mismo campo, gana la edición más reciente.
// - Varias pestañas del mismo equipo se mantienen sincronizadas entre sí (BroadcastChannel).
import { create } from 'zustand'
import { useMemo } from 'react'
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys, getMany as idbGetMany } from 'idb-keyval'
import type { AppNotification, AuditEntry, BaseDoc, CollectionName, Collections, DataState, Employee, ID, Role, Settings } from './types'
import { COLLECTIONS } from './types'
import { nowIso, today, uid } from './format'
import { hashPin } from './crypto'
import { logError } from './errorLog'
import { runAutomations, type AutomationApi } from './automations'

const KEY_COL = 'lajoya:v2:col:'
const KEY_V1_DATA = 'lajoya:v1:data'
const KEY_SETTINGS = 'lajoya:v1:settings'
const KEY_SESSION = 'lajoya:v1:session'
const KEY_DIRTY = 'lajoya:v1:dirty'
const SNAP_PREFIX = 'lajoya:snap:'
const SNAP_KEEP = 14
const AUDIT_KEEP = 3000
const META_KEYS = new Set(['id', '_ft', 'createdAt', 'updatedAt', 'updatedBy'])

export const emptyData = (): DataState => Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) as unknown as DataState

export const DEFAULT_SETTINGS: Settings = {
  ranchName: 'Jardines La Joya',
  address: 'C. Crisantemo, Tototlán, Jalisco',
  phone: '',
  lat: 20.5498402,
  lng: -102.784044,
  theme: 'auto',
  atmos: 'flor',
  checkInTime: '15:00',
  checkOutTime: '12:00',
  depositPercent: 30,
  ivaPercent: 16,
  autoLockMinutes: 15,
  automations: {
    checkoutCleaning: true,
    cleaningUnlocksUnit: true,
    eventPlan: true,
    inventoryDeduct: true,
    lowStockShopping: true,
    paymentReminders: true,
    autoAssign: true,
  },
}

export type SyncStatus = 'local' | 'idle' | 'syncing' | 'error' | 'offline' | 'follower'
export type RealtimeStatus = 'off' | 'connecting' | 'live' | 'error'

export interface SyncState {
  status: SyncStatus
  realtime: RealtimeStatus
  leader: boolean
  lastSyncAt?: string
  lastPushAt?: string
  lastPullAt?: string
  latencyMs?: number
  error?: string
  nextRetryAt?: number
  pushed: number
  pulled: number
  merged: number
  rejected: string[]
  log: { at: string; level: 'info' | 'warn' | 'error'; msg: string }[]
}

interface Session {
  userId?: ID
  locked: boolean
  lastActive: number
}

interface MutateOpts {
  /** No registrar en bitácora ni disparar automatizaciones (sincronización, restauración) */
  silent?: boolean
  /** Texto para la bitácora */
  summary?: string
  automationDepth?: number
  /** Etiqueta de la automatización que hizo el cambio */
  byAutomation?: string
}

type DocInput<K extends CollectionName> = Partial<Collections[K]> & { id?: ID }

export interface StoreState {
  ready: boolean
  data: DataState
  settings: Settings
  session: Session
  dirty: Record<string, true>
  sync: SyncState

  hydrate: () => Promise<void>
  upsert: <K extends CollectionName>(col: K, doc: DocInput<K>, opts?: MutateOpts) => Collections[K]
  patch: <K extends CollectionName>(col: K, id: ID, partial: Partial<Collections[K]>, opts?: MutateOpts) => Collections[K] | undefined
  remove: (col: CollectionName, id: ID, opts?: MutateOpts) => void
  notify: (n: Omit<AppNotification, keyof BaseDoc | 'read'>) => void
  setSettings: (partial: Partial<Settings>) => void
  login: (employeeId: ID, pin: string) => boolean
  logout: () => void
  lock: () => void
  touch: () => void
  replaceAll: (data: DataState, settings?: Settings) => void
  /** Combina documentos que llegan de la nube o de otra pestaña. Devuelve cuántos cambiaron. */
  mergeRemote: (col: CollectionName, docs: Collections[CollectionName][], opts?: { fromPeer?: boolean; dirtyKeys?: string[] }) => number
  clearDirty: (keys: string[], opts?: { fromPeer?: boolean }) => void
  setSync: (s: Partial<SyncState>) => void
  syncLog: (level: SyncState['log'][number]['level'], msg: string) => void
  log: (action: AuditEntry['action'], collection: string, summary: string, docId?: ID) => void
}

// ── Utilidades de combinación ────────────────────────────
const same = (a: unknown, b: unknown) => a === b || (typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b))
const fieldTime = (doc: any, k: string): string => doc?._ft?.[k] ?? doc?.updatedAt ?? ''

/** Combina dos versiones de un documento campo por campo (LWW por campo). */
export function mergeDocs<T extends BaseDoc>(local: T, remote: T): { doc: T; remoteWon: boolean; localWon: boolean } {
  const out: any = { ...local }
  const ft: Record<string, string> = { ...(local._ft ?? {}) }
  let remoteWon = false
  let localWon = false
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])
  for (const k of keys) {
    if (META_KEYS.has(k)) continue
    const inR = k in remote
    const inL = k in local
    if (inR && !inL) {
      out[k] = (remote as any)[k]
      ft[k] = fieldTime(remote, k)
      remoteWon = true
      continue
    }
    if (!inR) {
      localWon = true
      continue
    }
    if (same((local as any)[k], (remote as any)[k])) {
      ft[k] = fieldTime(remote, k) > fieldTime(local, k) ? fieldTime(remote, k) : fieldTime(local, k)
      continue
    }
    if (fieldTime(remote, k) > fieldTime(local, k)) {
      out[k] = (remote as any)[k]
      ft[k] = fieldTime(remote, k)
      remoteWon = true
    } else localWon = true
  }
  out._ft = ft
  out.updatedAt = remote.updatedAt > local.updatedAt ? remote.updatedAt : local.updatedAt
  out.createdAt = local.createdAt || remote.createdAt
  return { doc: out as T, remoteWon, localWon }
}

// ── Persistencia por colección ───────────────────────────
let persistTimer: ReturnType<typeof setTimeout> | undefined
const dirtyCols = new Set<CollectionName>()
let dirtyKeyChanged = false

function flushPersist() {
  clearTimeout(persistTimer)
  const s = useStore.getState()
  for (const c of dirtyCols) void idbSet(KEY_COL + c, s.data[c])
  dirtyCols.clear()
  if (dirtyKeyChanged) {
    void idbSet(KEY_DIRTY, s.dirty)
    dirtyKeyChanged = false
  }
}
function schedulePersist(col?: CollectionName, dirtyChanged = true) {
  if (col) dirtyCols.add(col)
  if (dirtyChanged) dirtyKeyChanged = true
  clearTimeout(persistTimer)
  persistTimer = setTimeout(flushPersist, 300)
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPersist)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushPersist())
}

// ── Cambios locales → motor de sincronización ────────────
type Listener = () => void
const changeListeners = new Set<Listener>()
export const onLocalChange = (fn: Listener) => {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)
}
const emitChange = () => changeListeners.forEach((fn) => fn())

// ── Pestañas hermanas (mismo equipo) ─────────────────────
type PeerMsg =
  | { t: 'docs'; col: CollectionName; docs: any[]; dirty: string[] }
  | { t: 'clean'; keys: string[] }
  | { t: 'settings'; settings: Settings }
  | { t: 'session'; session: Session }
  | { t: 'replace' }
const peer: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lajoya') : null
const post = (m: PeerMsg) => {
  try {
    peer?.postMessage(m)
  } catch {
    /* documento no clonable: se ignora */
  }
}

const describe = (col: CollectionName, doc: any): string => doc?.name || doc?.title || doc?.guestName || doc?.concept || doc?.clientName || doc?.description || doc?.id || col

const INITIAL_SYNC: SyncState = { status: 'local', realtime: 'off', leader: true, pushed: 0, pulled: 0, merged: 0, rejected: [], log: [] }

export const useStore = create<StoreState>()((set, get) => {
  const automationApi = (depth: number, rule: string): AutomationApi => ({
    get: () => get(),
    upsert: (col, doc) => get().upsert(col, doc, { automationDepth: depth + 1, byAutomation: rule }),
    patch: (col, id, partial) => get().patch(col, id, partial, { automationDepth: depth + 1, byAutomation: rule }),
    notify: (n) => get().notify(n),
  })

  const afterMutation = <K extends CollectionName>(col: K, before: Collections[K] | undefined, after: Collections[K], opts: MutateOpts) => {
    if (opts.silent) return
    if (col !== 'audit' && col !== 'notifications') {
      const action = !before ? 'crear' : after.deleted ? 'eliminar' : 'editar'
      get().log(
        opts.byAutomation ? 'automatizacion' : action,
        col,
        opts.summary ?? `${action === 'crear' ? 'Creó' : action === 'eliminar' ? 'Eliminó' : 'Editó'} ${describe(col, after)}${opts.byAutomation ? ` · ${opts.byAutomation}` : ''}`,
        after.id,
      )
    }
    const depth = opts.automationDepth ?? 0
    if (depth < 4) {
      try {
        runAutomations({ col, before, after, settings: get().settings, depth, api: (rule) => automationApi(depth, rule) })
      } catch (err) {
        console.error('Automatización falló', err)
      }
    }
  }

  return {
    ready: false,
    data: emptyData(),
    settings: DEFAULT_SETTINGS,
    session: { locked: false, lastActive: Date.now() },
    dirty: {},
    sync: INITIAL_SYNC,

    hydrate: async () => {
      const cols = await idbGetMany<Record<ID, any> | undefined>(COLLECTIONS.map((c) => KEY_COL + c))
      const [settings, session, dirty] = await Promise.all([idbGet<Settings>(KEY_SETTINGS), idbGet<Session>(KEY_SESSION), idbGet<Record<string, true>>(KEY_DIRTY)])
      let data = emptyData()
      COLLECTIONS.forEach((c, i) => {
        if (cols[i]) (data as any)[c] = cols[i]
      })
      // Un dispositivo vinculado a la nube nunca inventa datos de ejemplo: espera a bajar los reales
      if (!Object.keys(data.employees).length && !settings?.supabaseUrl) {
        // Migración desde el formato v1 (un solo bloque) o datos de demostración
        const v1 = await idbGet<DataState>(KEY_V1_DATA)
        if (v1 && Object.keys(v1.employees || {}).length) {
          data = { ...emptyData(), ...v1 }
          await idbDel(KEY_V1_DATA)
        } else {
          const { createSeed } = await import('./seed')
          data = createSeed()
        }
        await Promise.all(COLLECTIONS.map((c) => idbSet(KEY_COL + c, data[c])))
      }
      const mergedSettings = { ...DEFAULT_SETTINGS, ...settings, automations: { ...DEFAULT_SETTINGS.automations, ...settings?.automations } }
      const s = session ?? { locked: false, lastActive: Date.now() }
      const idleMin = (Date.now() - (s.lastActive || 0)) / 60000
      if (s.userId && mergedSettings.autoLockMinutes && idleMin > mergedSettings.autoLockMinutes) s.locked = true
      set({ data, settings: mergedSettings, session: s, dirty: dirty ?? {}, ready: true })
      // Marca para medir el arranque (Rendimiento en las herramientas del navegador)
      performance.mark?.('la-joya:datos-listos')
      void dailySnapshot(data)
    },

    upsert: (col, doc, opts = {}) => {
      const state = get()
      const id = doc.id ?? uid(col.slice(0, 3) + '_')
      const before = state.data[col][id] as Collections[typeof col] | undefined
      const now = nowIso()
      const ft: Record<string, string> = { ...(before?._ft ?? {}) }
      const clean: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(doc)) {
        if (META_KEYS.has(k)) continue
        const val = v === undefined ? null : v // null = "borrado" explícito, viaja por JSON
        if (!before || !same((before as any)[k], val)) ft[k] = now
        clean[k] = val
      }
      const after = { ...(before ?? { createdAt: now }), ...clean, id, updatedAt: now, updatedBy: state.session.userId, _ft: ft } as Collections[typeof col]
      const key = `${col}:${id}`
      set((s) => ({ data: { ...s.data, [col]: { ...s.data[col], [id]: after } }, dirty: { ...s.dirty, [key]: true } }))
      schedulePersist(col)
      post({ t: 'docs', col, docs: [after], dirty: [key] })
      emitChange()
      afterMutation(col, before, after, opts)
      return after
    },

    patch: (col, id, partial, opts = {}) => {
      if (!get().data[col][id]) return undefined
      return get().upsert(col, { ...(partial as object), id } as DocInput<typeof col>, opts)
    },

    remove: (col, id, opts = {}) => {
      if (!get().data[col][id]) return
      get().upsert(col, { id, deleted: true } as DocInput<typeof col>, opts)
    },

    notify: (n) => {
      get().upsert('notifications', { ...n, read: false } as DocInput<'notifications'>, { silent: true })
    },

    setSettings: (partial) => {
      const settings = { ...get().settings, ...partial }
      set({ settings })
      void idbSet(KEY_SETTINGS, settings)
      post({ t: 'settings', settings })
    },

    login: (employeeId, pin) => {
      const emp = get().data.employees[employeeId]
      if (!emp || !emp.active || emp.deleted) return false
      if (emp.pinHash !== hashPin(emp.id, pin)) {
        get().log('sesion', 'employees', `PIN incorrecto para ${emp.name}`, emp.id)
        return false
      }
      const session = { userId: emp.id, locked: false, lastActive: Date.now() }
      set({ session })
      void idbSet(KEY_SESSION, session)
      get().log('sesion', 'employees', `${emp.name} inició sesión`, emp.id)
      return true
    },

    logout: () => {
      const session = { locked: false, lastActive: Date.now() }
      set({ session })
      void idbSet(KEY_SESSION, session)
      post({ t: 'session', session })
    },

    lock: () => {
      const session = { ...get().session, locked: true }
      set({ session })
      void idbSet(KEY_SESSION, session)
    },

    touch: () => {
      const session = { ...get().session, lastActive: Date.now() }
      set({ session })
      void idbSet(KEY_SESSION, session)
    },

    replaceAll: (data, settings) => {
      for (const c of COLLECTIONS) if (!data[c]) (data as any)[c] = {}
      const dirty: Record<string, true> = {}
      for (const c of COLLECTIONS) for (const id of Object.keys(data[c])) dirty[`${c}:${id}`] = true
      set({ data, dirty, ...(settings ? { settings: { ...get().settings, ...settings } } : {}) })
      if (settings) void idbSet(KEY_SETTINGS, get().settings)
      COLLECTIONS.forEach((c) => dirtyCols.add(c))
      schedulePersist()
      post({ t: 'replace' })
      emitChange()
    },

    mergeRemote: (col, docs, opts = {}) => {
      if (!docs.length) return 0
      let changed = 0
      let mergedCount = 0
      const pushBack: string[] = []
      set((s) => {
        const next = { ...s.data[col] } as Record<ID, any>
        for (const d of docs) {
          if (!d?.id) continue
          const local = next[d.id]
          if (!local) {
            next[d.id] = d
            changed++
            continue
          }
          const { doc, remoteWon, localWon } = mergeDocs(local, d)
          if (remoteWon) {
            next[d.id] = doc
            changed++
          }
          if (remoteWon && localWon) mergedCount++
          // La versión local tenía campos más nuevos: hay que devolver la combinación a la nube
          if (localWon && !opts.fromPeer) pushBack.push(`${col}:${d.id}`)
        }
        const dirtyAdd = [...pushBack, ...(opts.dirtyKeys ?? [])]
        const dirty = dirtyAdd.length ? { ...s.dirty, ...Object.fromEntries(dirtyAdd.map((k) => [k, true as const])) } : s.dirty
        return changed || dirtyAdd.length ? { data: changed ? { ...s.data, [col]: next } : s.data, dirty, sync: mergedCount ? { ...s.sync, merged: s.sync.merged + mergedCount } : s.sync } : {}
      })
      if (changed || pushBack.length) schedulePersist(col, pushBack.length > 0 || !!opts.dirtyKeys?.length)
      if (pushBack.length) emitChange()
      return changed
    },

    clearDirty: (keys, opts = {}) => {
      set((s) => {
        const dirty = { ...s.dirty }
        for (const k of keys) delete dirty[k]
        return { dirty }
      })
      schedulePersist(undefined, true)
      if (!opts.fromPeer) post({ t: 'clean', keys })
    },

    setSync: (sync) => set((s) => ({ sync: { ...s.sync, ...sync } })),

    syncLog: (level, msg) => {
      // Los errores de sincronización también quedan en la bitácora del dispositivo (panel de desarrollador)
      if (level === 'error') logError('sync', msg)
      set((s) => ({ sync: { ...s.sync, log: [{ at: nowIso(), level, msg }, ...s.sync.log].slice(0, 40) } }))
    },

    log: (action, collection, summary, docId) => {
      const id = uid('aud_')
      const now = nowIso()
      const entry = { id, at: now, createdAt: now, updatedAt: now, userId: get().session.userId, action, collection, summary, docId }
      set((s) => {
        let audit = { ...s.data.audit, [id]: entry }
        if (Object.keys(audit).length > AUDIT_KEEP) {
          const sorted = Object.values(audit).sort((a, b) => a.at.localeCompare(b.at))
          audit = Object.fromEntries(sorted.slice(-AUDIT_KEEP).map((e) => [e.id, e]))
        }
        return { data: { ...s.data, audit }, dirty: { ...s.dirty, [`audit:${id}`]: true } }
      })
      schedulePersist('audit')
      post({ t: 'docs', col: 'audit', docs: [entry], dirty: [`audit:${id}`] })
      emitChange()
    },
  }
})

// Mensajes de pestañas hermanas
peer?.addEventListener('message', (e: MessageEvent<PeerMsg>) => {
  const m = e.data
  const s = useStore.getState()
  if (!s.ready) return
  if (m.t === 'docs') s.mergeRemote(m.col, m.docs, { fromPeer: true, dirtyKeys: m.dirty })
  else if (m.t === 'clean') s.clearDirty(m.keys, { fromPeer: true })
  else if (m.t === 'settings') useStore.setState({ settings: m.settings })
  else if (m.t === 'session' && !m.session.userId) useStore.setState({ session: m.session })
  else if (m.t === 'replace') location.reload()
})

// ── Respaldos locales automáticos ────────────────────────
async function dailySnapshot(data: DataState) {
  try {
    const key = SNAP_PREFIX + today()
    const all = (await idbKeys()).map(String).filter((k) => k.startsWith(SNAP_PREFIX)).sort()
    if (!all.includes(key)) {
      await idbSet(key, { at: nowIso(), data })
      all.push(key)
    }
    for (const old of all.slice(0, Math.max(0, all.length - SNAP_KEEP))) await idbDel(old)
  } catch (e) {
    console.warn('No se pudo crear el respaldo diario', e)
  }
}

export async function listSnapshots() {
  const all = (await idbKeys()).map(String).filter((k) => k.startsWith(SNAP_PREFIX)).sort().reverse()
  const out: { key: string; date: string; at: string; size: number }[] = []
  for (const key of all) {
    const snap = await idbGet<{ at: string; data: DataState }>(key)
    if (snap) out.push({ key, date: key.slice(SNAP_PREFIX.length), at: snap.at, size: JSON.stringify(snap.data).length })
  }
  return out
}

export async function snapshotNow() {
  const data = useStore.getState().data
  await idbSet(SNAP_PREFIX + today(), { at: nowIso(), data })
}

export async function restoreSnapshot(key: string) {
  const snap = await idbGet<{ at: string; data: DataState }>(key)
  if (!snap) throw new Error('Respaldo no encontrado')
  useStore.getState().replaceAll({ ...emptyData(), ...snap.data })
  useStore.getState().log('restaurar', 'sistema', `Restauró el respaldo del ${key.slice(SNAP_PREFIX.length)}`)
}

export async function resetDemo() {
  // Con la nube conectada, los datos de ejemplo se subirían como si fueran reales: no se permite
  if (useStore.getState().settings.supabaseUrl) throw new Error('Este dispositivo está conectado a la nube. Desvincúlalo antes de cargar datos de demostración.')
  const { createSeed } = await import('./seed')
  useStore.getState().replaceAll(createSeed())
}

// ── Hooks de lectura ─────────────────────────────────────
// Seleccionar el registro (referencia estable) y derivar con useMemo; nunca arreglos nuevos en el selector.
export function useCollection<K extends CollectionName>(col: K): Collections[K][] {
  const rec = useStore((s) => s.data[col])
  return useMemo(() => (Object.values(rec ?? {}) as Collections[K][]).filter((d) => !d.deleted), [rec])
}

export function useDoc<K extends CollectionName>(col: K, id: ID | undefined): Collections[K] | undefined {
  return useStore((s) => {
    if (!id) return undefined
    const d = s.data[col]?.[id] as Collections[K] | undefined
    return d && !d.deleted ? d : undefined
  })
}

export function useMe(): Employee | undefined {
  return useStore((s) => (s.session.userId ? s.data.employees[s.session.userId] : undefined))
}

export function useRole(): Role | undefined {
  return useMe()?.role
}

/** Acceso imperativo (fuera de componentes) */
export const db = {
  get state() {
    return useStore.getState()
  },
  upsert: <K extends CollectionName>(col: K, doc: DocInput<K>, opts?: MutateOpts) => useStore.getState().upsert(col, doc, opts),
  patch: <K extends CollectionName>(col: K, id: ID, partial: Partial<Collections[K]>, opts?: MutateOpts) => useStore.getState().patch(col, id, partial, opts),
  remove: (col: CollectionName, id: ID, opts?: MutateOpts) => useStore.getState().remove(col, id, opts),
  list: <K extends CollectionName>(col: K) => (Object.values(useStore.getState().data[col]) as Collections[K][]).filter((d) => !d.deleted),
  get: <K extends CollectionName>(col: K, id: ID) => {
    const d = useStore.getState().data[col][id] as Collections[K] | undefined
    return d && !d.deleted ? d : undefined
  },
}

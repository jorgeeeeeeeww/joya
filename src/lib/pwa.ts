// Capacidades de app instalada: actualizaciones, instalación, insignia, push y pantalla encendida.
//
// Actualizaciones (pensado para iPhone, que congela los temporizadores en segundo plano):
// - Se busca versión nueva al abrir la app, al volver a ella y al recuperar internet (no con un reloj).
// - Recién abierta desde el ícono, si ya hay versión nueva descargada, se aplica sola antes de mostrar nada.
// - Después de más de 5 minutos fuera, se aplica al volver; si la persona está a media captura, sale el aviso.
// - Antes de recargar, todo lo que está en memoria se guarda en el dispositivo: no se pierde nada.
import { useEffect } from 'react'
import { create } from 'zustand'
import { registerSW } from 'virtual:pwa-register'
import { getClient } from './sync'
import { flushNow, useStore } from './store'
import { logError } from './errorLog'
import { useVersion } from './version'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaState {
  needRefresh: boolean
  /** La nube exige una versión más nueva: hay que actualizar para seguir sincronizando */
  required: boolean
  offlineReady: boolean
  installEvent: BeforeInstallPromptEvent | null
  installed: boolean
  update: (() => Promise<void>) | null
  dismissInstall: boolean
}

export const usePwa = create<PwaState>(() => ({
  needRefresh: false,
  required: false,
  offlineReady: false,
  installEvent: null,
  installed: typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true),
  update: null,
  dismissInstall: false,
}))

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Contador de visitas: la tarjeta de instalación aparece desde la segunda visita (regla step1). */
export function visitCount() {
  try {
    const n = Number(localStorage.getItem('lajoya:visits') || '0')
    return n
  } catch {
    return 0
  }
}

export function initPwa() {
  try {
    const n = Number(localStorage.getItem('lajoya:visits') || '0') + 1
    localStorage.setItem('lajoya:visits', String(n))
  } catch {
    /* almacenamiento bloqueado */
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    usePwa.setState({ installEvent: e as BeforeInstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => usePwa.setState({ installed: true, installEvent: null }))
}

// ── Actualizaciones ──────────────────────────────────────
const BOOT_AT = Date.now()
/** Tiempo después de abrir la app en que una versión nueva se aplica sola (todavía no se ha tocado nada) */
const FRESH_LAUNCH_MS = 12_000
const AWAY_MS = 5 * 60_000
let swReg: ServiceWorkerRegistration | undefined
let updateSW: ((reload?: boolean) => Promise<void>) | undefined
let hiddenAt = 0
let lastCheck = 0
let lastInteraction = 0

/** ¿Hay alguien capturando algo? (campo con el cursor, hoja o ventana abierta, gesto reciente) */
export function isBusy(): boolean {
  if (typeof document === 'undefined') return false
  const a = document.activeElement as HTMLElement | null
  if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return true
  if (document.querySelector('[role="dialog"], [aria-modal="true"], [data-ocupado]')) return true
  // Tocó la pantalla hace menos de 4 segundos: puede estar a medio gesto (arrastrar, firmar)
  return Date.now() - lastInteraction < 4000
}

/** Recarga una sola vez (si ya se recargó hace poco, no insiste: así nunca se queda en un ciclo) */
export function reloadOnce(reason: string): boolean {
  try {
    const last = Number(sessionStorage.getItem('lajoya:recargada') || '0')
    if (Date.now() - last < 30_000) return false
    sessionStorage.setItem('lajoya:recargada', String(Date.now()))
  } catch {
    /* sin almacenamiento de sesión: se recarga igual */
  }
  logError('consola', `Recarga automática: ${reason}`)
  void flushNow().finally(() => location.reload())
  return true
}

/** Aplica la versión nueva: guarda todo lo que está en memoria y recarga con la nueva. */
export async function applyUpdate() {
  await flushNow()
  if (!swReg?.waiting || !updateSW) return void location.reload()
  // Si el sistema no confirma el cambio en unos segundos, se recarga igual
  const fallback = setTimeout(() => location.reload(), 4000)
  try {
    await updateSW(true)
  } catch {
    clearTimeout(fallback)
    location.reload()
  }
}

/** Busca versión nueva en el servidor. Devuelve true si hay una lista para aplicar. */
export async function checkForUpdate(force = false): Promise<boolean> {
  const reg = swReg
  if (!reg || !navigator.onLine) return !!reg?.waiting
  if (!force && Date.now() - lastCheck < 30_000) return !!reg.waiting
  lastCheck = Date.now()
  try {
    await reg.update()
  } catch {
    /* sin red o servidor caído: se vuelve a intentar al regresar a la app */
  }
  // La versión nueva tarda un momento en descargarse e instalarse
  const installing = reg.installing
  if (installing) {
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 15_000)
      installing.addEventListener('statechange', () => {
        if (installing.state !== 'installing') {
          clearTimeout(t)
          resolve()
        }
      })
    })
  }
  return !!reg.waiting
}

function maybeAutoApply(away = false) {
  const { needRefresh, required } = usePwa.getState()
  if (!needRefresh || !swReg?.waiting) return
  const fresh = Date.now() - BOOT_AT < FRESH_LAUNCH_MS
  if ((fresh || away || required) && !isBusy()) void applyUpdate()
}

/**
 * Al abrir la app: si ya hay una versión nueva descargada, se aplica antes de mostrar nada.
 * Devuelve false si no había nada que aplicar (la app arranca normal).
 */
export async function applyWaitingAtBoot(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return false
  try {
    const reg = await Promise.race([navigator.serviceWorker.getRegistration(), new Promise<undefined>((r) => setTimeout(() => r(undefined), 800))])
    const waiting = reg?.waiting
    if (!waiting) return false
    // Si ya se intentó hace menos de un minuto (algo falló), la app abre normal y queda el aviso «Actualizar».
    // (No se marca por dirección: el service worker se llama igual en todas las versiones.)
    const mark = 'lajoya:arranqueActualizado'
    if (Date.now() - Number(sessionStorage.getItem(mark) || '0') < 60_000) return false
    sessionStorage.setItem(mark, String(Date.now()))
    return await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 2500)
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          clearTimeout(t)
          location.reload()
        },
        { once: true },
      )
      waiting.postMessage({ type: 'SKIP_WAITING' })
    })
  } catch {
    return false
  }
}

/** Registra el service worker y escucha cuándo buscar versión nueva. Se llama una vez al arrancar. */
export function initUpdates() {
  if (!('serviceWorker' in navigator)) return
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => {
      usePwa.setState({ needRefresh: true })
      // El aviso puede llegar antes que el registro: se toma de ahí para poder aplicarla
      if (swReg) maybeAutoApply()
      else
        void navigator.serviceWorker.getRegistration().then((reg) => {
          swReg ??= reg
          maybeAutoApply()
        })
    },
    onOfflineReady: () => usePwa.setState({ offlineReady: true }),
    onRegisteredSW: (_url, reg) => {
      swReg = reg
      if (reg?.waiting) {
        usePwa.setState({ needRefresh: true })
        maybeAutoApply()
      }
    },
    onRegisterError: (e: unknown) => logError('promesa', `No se pudo preparar la app sin internet: ${(e as Error)?.message ?? e}`),
  })
  usePwa.setState({ update: applyUpdate })

  const markTouch = () => (lastInteraction = Date.now())
  window.addEventListener('pointerdown', markTouch, { passive: true, capture: true })
  window.addEventListener('keydown', markTouch, { passive: true, capture: true })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    const away = hiddenAt > 0 && Date.now() - hiddenAt > AWAY_MS
    hiddenAt = 0
    void checkForUpdate().then(() => maybeAutoApply(away))
  })
  // iPhone a veces regresa la página desde memoria sin avisar con visibilitychange
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) void checkForUpdate().then(() => maybeAutoApply(true))
  })
  window.addEventListener('online', () => void checkForUpdate())
  // En computadoras que se quedan abiertas todo el día también se revisa de vez en cuando
  setInterval(() => {
    if (document.visibilityState === 'visible') void checkForUpdate()
  }, 60 * 60 * 1000)

  // La nube exige una versión más nueva: se busca y se aplica en cuanto nadie esté capturando
  useVersion.subscribe((s) => {
    usePwa.setState({ required: s.required })
    if (s.required) void checkForUpdate(true).then(() => maybeAutoApply())
  })
  setInterval(() => {
    if (usePwa.getState().required && document.visibilityState === 'visible') void checkForUpdate().then(() => maybeAutoApply())
  }, 20_000)

  // Falta un archivo de la app (se publicó una versión nueva y el viejo ya no existe): recarga una vez
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadOnce('faltaba un archivo de la versión anterior')) e.preventDefault()
  })
}

export async function promptInstall() {
  const ev = usePwa.getState().installEvent
  if (!ev) return false
  await ev.prompt()
  const { outcome } = await ev.userChoice
  usePwa.setState({ installEvent: null })
  return outcome === 'accepted'
}

// ── Insignia en el ícono de la app ───────────────────────
export function useAppBadge(count: number) {
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (!nav.setAppBadge) return
    if (count > 0) void nav.setAppBadge(count).catch(() => {})
    else void nav.clearAppBadge?.().catch(() => {})
  }, [count])
}

// ── Pantalla siempre encendida (limpieza en curso, día del evento) ──
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {
        /* el navegador lo negó (batería baja, pestaña oculta) */
      }
    }
    void acquire()
    const onVis = () => document.visibilityState === 'visible' && !cancelled && void acquire()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release().catch(() => {})
    }
  }, [active])
}

// ── Notificaciones push ──────────────────────────────────
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const urlB64ToUint8 = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function pushStatus(): Promise<'unsupported' | 'denied' | 'on' | 'off'> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

export async function enablePush(): Promise<string> {
  if (!pushSupported()) throw new Error(isIOS() ? 'En iPhone primero instala la app en la pantalla de inicio' : 'Este navegador no admite notificaciones')
  const key = useStore.getState().settings.vapidPublicKey || import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!key) throw new Error('Falta la llave VAPID en Ajustes → Nube')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Permiso de notificaciones denegado')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) }))
  const sb = await getClient()
  if (!sb) throw new Error('Conecta primero la nube')
  // El puesto (rol) no lo manda el celular: la nube lo toma de la cuenta vinculada
  const { error } = await sb.from('push_subscriptions').upsert({ endpoint: sub.endpoint, subscription: sub.toJSON(), device: navigator.userAgent.slice(0, 120) })
  if (error) throw new Error(error.message)
  return 'Notificaciones activadas en este dispositivo'
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  const sb = await getClient()
  await sb?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** Almacenamiento del dispositivo */
export async function storageInfo() {
  const est = await navigator.storage?.estimate?.()
  const persisted = (await navigator.storage?.persisted?.()) ?? false
  return { usage: est?.usage ?? 0, quota: est?.quota ?? 0, persisted }
}

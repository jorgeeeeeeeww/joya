// Capacidades de app instalada: actualizaciones, instalación, insignia, push y pantalla encendida.
import { useEffect } from 'react'
import { create } from 'zustand'
import { getClient } from './sync'
import { useStore } from './store'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaState {
  needRefresh: boolean
  offlineReady: boolean
  installEvent: BeforeInstallPromptEvent | null
  installed: boolean
  update: (() => Promise<void>) | null
  dismissInstall: boolean
}

export const usePwa = create<PwaState>(() => ({
  needRefresh: false,
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
  const key = useStore.getState().settings.vapidPublicKey
  if (!key) throw new Error('Falta la llave VAPID en Ajustes → Nube')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Permiso de notificaciones denegado')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) }))
  const sb = await getClient()
  if (!sb) throw new Error('Conecta primero la nube')
  const me = useStore.getState().session.userId
  const role = me ? useStore.getState().data.employees[me]?.role : undefined
  const { error } = await sb.from('push_subscriptions').upsert({ endpoint: sub.endpoint, subscription: sub.toJSON(), role, device: navigator.userAgent.slice(0, 120) })
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

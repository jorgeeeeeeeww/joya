/// <reference lib="webworker" />
// Service worker único de La Joya: la app sin internet, las actualizaciones y los avisos push viven aquí
// juntos, así siempre se actualizan al mismo tiempo (antes los avisos iban en un archivo aparte).
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] }
declare const __BUILD_ID__: string

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Cualquier dirección de la app abre la misma página (la app decide qué pantalla mostrar)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/functions\//, /^\/rest\//, /^\/auth\//, /^\/storage\//] }))

// Lo pesado y opcional (motor 3D y lector de códigos) se guarda la primera vez que se usa
registerRoute(
  ({ url }) => url.origin === self.location.origin && /\/assets\/(tres-d-[^/]+\.js|[^/]+\.wasm)$/.test(url.pathname),
  new CacheFirst({ cacheName: 'modulos-pesados', plugins: [new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 60 })] }),
)

// Pantallas de arranque de iPhone: no van en la instalación; se guardan si el sistema las pide
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/arranque/'),
  new CacheFirst({ cacheName: 'arranque', plugins: [new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 90 })] }),
)

registerRoute(({ url }) => url.hostname === 'api.open-meteo.com', new NetworkFirst({ cacheName: 'clima', networkTimeoutSeconds: 6, plugins: [new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 60 * 60 * 6 })] }))

// ── Actualizaciones ──────────────────────────────────────
self.addEventListener('message', (event) => {
  const type = (event.data as { type?: string } | undefined)?.type
  if (type === 'SKIP_WAITING') void self.skipWaiting()
  // La app pregunta qué versión trae este service worker (para el monitor de dispositivos)
  if (type === 'VERSION') event.ports[0]?.postMessage({ build: __BUILD_ID__ })
})

// ── Avisos push ──────────────────────────────────────────
interface PushData {
  title: string
  body: string
  url: string
  tag: string
}

self.addEventListener('push', (event) => {
  let data: PushData = { title: 'La Joya', body: 'Tienes un aviso nuevo', url: '/', tag: 'la-joya' }
  try {
    const raw = event.data?.json() as Partial<PushData> | undefined
    if (raw && typeof raw === 'object') data = { ...data, ...raw }
  } catch {
    const text = event.data?.text()
    if (text) data = { ...data, body: text }
  }
  // iPhone retira el permiso de avisos si llega un push y no se muestra nada: siempre se muestra algo,
  // aunque falle la primera forma (por ejemplo, «renotify» sin etiqueta hace fallar a Chrome)
  event.waitUntil(
    (async () => {
      const tag = String(data.tag || 'la-joya')
      try {
        await self.registration.showNotification(String(data.title || 'La Joya'), {
          body: String(data.body ?? ''),
          icon: '/pwa-192x192.png',
          badge: '/pwa-64x64.png',
          tag,
          renotify: true,
          data: { url: data.url || '/' },
        } as NotificationOptions)
      } catch {
        await self.registration.showNotification('La Joya', { body: String(data.body ?? 'Tienes un aviso nuevo'), icon: '/pwa-192x192.png', data: { url: data.url || '/' } })
      }
      try {
        const nav = self.navigator as WorkerNavigator & { setAppBadge?: (n?: number) => Promise<void> }
        if (nav.setAppBadge) {
          const list = await self.registration.getNotifications()
          await nav.setAppBadge(list.length)
        }
      } catch {
        /* sin insignia en este sistema */
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(((event.notification.data as { url?: string } | null)?.url || '/') as string, self.location.origin)
  // Solo se abren direcciones de la propia app
  const url = target.origin === self.location.origin ? target.pathname + target.search + target.hash : '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of all) {
        if ('focus' in c) {
          const win = await (c as WindowClient).focus()
          try {
            await win.navigate(url)
          } catch {
            /* la ventana no se pudo mover; queda enfocada */
          }
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})

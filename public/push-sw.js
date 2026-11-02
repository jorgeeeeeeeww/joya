/* La Joya · manejo de notificaciones push dentro del service worker (importado por Workbox). */
self.addEventListener('push', (event) => {
  let data = { title: 'La Joya', body: 'Tienes un aviso nuevo', url: '/' }
  try {
    data = { ...data, ...event.data.json() }
  } catch (e) {
    /* payload de texto */
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-64x64.png',
        tag: data.tag,
        renotify: true,
        data: { url: data.url },
      })
      if (self.navigator && 'setAppBadge' in self.navigator) {
        const list = await self.registration.getNotifications()
        self.navigator.setAppBadge(list.length).catch(() => {})
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of all) {
        if ('focus' in c) {
          await c.focus()
          if ('navigate' in c) return c.navigate(url)
          return
        }
      }
      return self.clients.openWindow(url)
    })(),
  )
})

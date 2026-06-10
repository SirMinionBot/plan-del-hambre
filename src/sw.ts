/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

import { clientsClaim } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'

self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)

interface PushPayload {
  title?: string
  body?: string
  url?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = { body: event.data?.text() ?? '' }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'PLAN DEL HAMBRE', {
      body: payload.body ?? '',
      icon: 'pwa-192.png', // relativo al scope (funciona en raíz y en /plan-del-hambre/)
      badge: 'pwa-192.png',
      data: { url: payload.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => 'focus' in c)
      if (open) {
        void open.navigate(url)
        return open.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})

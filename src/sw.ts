/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

import { clientsClaim } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)

// Datos de Supabase: red primero, caché como respaldo → la app funciona sin
// cobertura (sótano del súper) mostrando los últimos datos vistos.
// Las escrituras (POST/PATCH) no se cachean: fallan offline y la UI lo enseña.
registerRoute(
  ({ url, request }) =>
    url.hostname.endsWith('.supabase.co') &&
    (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/auth/v1/user')) &&
    request.method === 'GET',
  new NetworkFirst({
    cacheName: 'supabase-data',
    networkTimeoutSeconds: 4,
    plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 7 * 24 * 3600 })],
  }),
)

// OCR local (tesseract): worker, wasm y modelo de idioma quedan cacheados
// tras el primer escaneo → los siguientes funcionan sin internet.
registerRoute(
  ({ url }) => url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'tessdata.projectnaptha.com',
  new CacheFirst({
    cacheName: 'ocr-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 })],
  }),
)

// Fotos de recetas (Spoonacular u otros CDN de imagen): stale-while-revalidate
// → se ven al instante desde caché y se refrescan en segundo plano; el
// catálogo sigue teniendo cara sin conexión.
registerRoute(
  ({ url, request }) => request.destination === 'image' && url.hostname === 'img.spoonacular.com',
  new StaleWhileRevalidate({
    cacheName: 'recipe-images',
    plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 90 * 24 * 3600 })],
  }),
)

// Fuentes de Google: caché primero (no cambian)
registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 3600 })],
  }),
)

interface PushPayload {
  title?: string
  body?: string
  url?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload
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

// Suscripción Web Push del usuario actual. Mejora progresiva: si no hay
// permiso, clave VAPID o soporte, la app sigue funcionando con banners in-app.

import { supabase } from './supabase'

export const vapidPublicKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? null

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function pushSupported(): boolean {
  return Boolean(vapidPublicKey) && 'serviceWorker' in navigator && 'PushManager' in window
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function subscribeToPush(userId: string): Promise<boolean> {
  if (!pushSupported()) return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!) as BufferSource,
  })
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    },
    { onConflict: 'endpoint' },
  )
  return !error
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await getCurrentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

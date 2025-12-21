import type { PushSubscribeIn } from '../api/ApiClient'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export type PushSupport = {
  supported: boolean
  reason?: string
}

export function getPushSupport(): PushSupport {
  if (!('serviceWorker' in navigator)) return { supported: false, reason: 'Service workers not supported' }
  if (!('PushManager' in window)) return { supported: false, reason: 'Push not supported in this browser' }
  if (!('Notification' in window)) return { supported: false, reason: 'Notifications not supported' }
  return { supported: true }
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  return await navigator.serviceWorker.register('/sw.js')
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const reg = await ensureServiceWorker()
  return await reg.pushManager.getSubscription()
}

export async function subscribeForPush(vapidPublicKey: string): Promise<PushSubscription> {
  const reg = await ensureServiceWorker()
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })
  return sub
}

export function toBackendPayload(sub: PushSubscription): PushSubscribeIn {
  const json = sub.toJSON()
  const keys = json.keys || {}
  return {
    endpoint: sub.endpoint,
    p256dh: String(keys.p256dh || ''),
    auth: String(keys.auth || ''),
    user_agent: navigator.userAgent,
  }
}



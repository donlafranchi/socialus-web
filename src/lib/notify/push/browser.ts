// #904 — the browser half: can this device get push, and subscribe it. Client only.

import { iosVersion } from './rules'

/** The PWA's service worker (main lane), which imports /push-sw.js for the push handlers. */
export const SW_PATH = '/sw.js'

export type Support = 'ready' | 'ios-install' | 'ios-old' | 'blocked' | 'unsupported'

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

export function pushSupport(): Support {
  const ios = iosVersion(navigator.userAgent)
  if (ios !== null && ios < 16.04) return 'ios-old'
  if (ios !== null && !isStandalone()) return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return 'ready'
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

const b64 = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '')

/** Asks for permission (call from a tap) and returns this browser's subscription, or why not. */
export async function subscribeThisBrowser(): Promise<{ endpoint: string; p256dh: string; auth: string } | 'denied' | 'failed'> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!key) return 'failed'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  try {
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register(SW_PATH))
    await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }))
    return { endpoint: sub.endpoint, p256dh: b64(sub.getKey('p256dh')), auth: b64(sub.getKey('auth')) }
  } catch (err) {
    console.error('[notify] subscribe failed:', err)
    return 'failed'
  }
}

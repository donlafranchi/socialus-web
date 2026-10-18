// #904 — one push through the `web-push` library, signed with our VAPID keys (free; no paid service).
// 404/410 means the browser dropped the subscription: the caller deletes it.

import webpush from 'web-push'
import type { PushMessage } from './rules'

type Env = Record<string, string | undefined>

export interface Subscription {
  endpoint: string
  p256dh: string
  auth: string
}

export type SendResult = 'ok' | 'gone' | 'error'

export function vapidReady(env: Env = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT)
}

export async function sendPush(
  sub: Subscription,
  message: PushMessage,
  { env = process.env, lib = webpush }: { env?: Env; lib?: Pick<typeof webpush, 'sendNotification'> } = {},
): Promise<SendResult> {
  if (!vapidReady(env)) throw new Error('[notify] VAPID keys are not set')
  try {
    await lib.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(message),
      {
        TTL: message.kind === 'weekend' ? 12 * 3600 : 6 * 3600,
        urgency: 'normal',
        topic: message.tag,
        vapidDetails: { subject: env.VAPID_SUBJECT!, publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! },
      },
    )
    return 'ok'
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) return 'gone'
    console.error(`[notify] push refused: ${status ?? (err instanceof Error ? err.message : err)}`)
    return 'error'
  }
}

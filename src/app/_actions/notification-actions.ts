'use server'

// #904 — the notifications screen and the landing bar. Failures come back as data, never as a throw.

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { memberNotificationsSet, memberPushSubscribe, memberPushUnsubscribe, memberNotificationsOpened } from '@/actions'
import type { MemberNotificationsSetInput } from '@/actions/member/notifications'
import { platformOf, type CountKind, type NotifyKind, type Prefs } from '@/lib/notify/push/rules'

type Result<T = object> = ({ ok: true } & T) | { ok: false }

async function memberId(): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  return error || !data.user ? null : data.user.id
}

async function run<T extends object>(fn: (id: string) => Promise<T>): Promise<Result<T>> {
  const id = await memberId()
  if (!id) return { ok: false }
  try {
    return { ok: true, ...(await fn(id)) }
  } catch (err) {
    console.error('[notify] action failed:', err instanceof Error ? err.message : err)
    return { ok: false }
  }
}

export async function saveNotificationPrefsAction(change: MemberNotificationsSetInput): Promise<Result<{ prefs: Prefs }>> {
  return run(async (id) => ({ prefs: await memberNotificationsSet(resolveActionContext({ actingMemberId: id }), change) }))
}

export async function savePushSubscriptionAction(sub: { endpoint: string; p256dh: string; auth: string }): Promise<Result> {
  const platform = platformOf((await headers()).get('user-agent') ?? '')
  return run(async (id) => memberPushSubscribe(resolveActionContext({ actingMemberId: id }), { ...sub, platform }))
}

export async function removePushSubscriptionAction(endpoint: string): Promise<Result> {
  return run(async (id) => memberPushUnsubscribe(resolveActionContext({ actingMemberId: id }), { endpoint }))
}

export async function countNotificationOpenAction(kind: CountKind): Promise<Result> {
  return run(async (id) => memberNotificationsOpened(resolveActionContext({ actingMemberId: id }), { kind }))
}

/** The landing bar's one tap: that kind off. */
export async function turnOffNotificationKindAction(kind: NotifyKind): Promise<Result> {
  return run(async (id) => memberNotificationsSet(resolveActionContext({ actingMemberId: id }), kind === 'follow_posts' ? { followPosts: false } : { weekend: false }))
}

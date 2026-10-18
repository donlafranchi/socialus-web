// #904 (Don, 2026-10-18, option A) — a member's notification choices and their push subscriptions.
//   member.notifications.set     which kinds, quiet hours, pause. Each change also adds to this week's counts.
//   member.push.subscribe        saves this browser's push endpoint for the member (upsert on the endpoint).
//   member.push.unsubscribe      forgets one endpoint.
//   member.notifications.opened  a notification was opened: one count, no member id kept.
// Counts are aggregate only (notification_weekly); nothing here records who did what.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'
import { DEFAULT_PREFS, NOTIFY_KINDS, type CountKind, type NotifyKind, type Prefs } from '../../lib/notify/push/rules'

const hour = z.number().int().min(0).max(23)
const kind = z.enum(['follow_posts', 'weekend'])

export const memberNotificationsSetInput = z
  .object({ followPosts: z.boolean(), weekend: z.boolean(), paused: z.boolean(), quietStart: hour, quietEnd: hour, remindEvening: z.boolean(), remindHour: z.boolean() })
  .partial()
export type MemberNotificationsSetInput = z.infer<typeof memberNotificationsSetInput>

export const memberPushSubscribeInput = z.object({
  endpoint: z.string().url().startsWith('https://').max(2000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(100),
  platform: z.enum(['ios', 'android', 'desktop', 'other']),
})
export type MemberPushSubscribeInput = z.infer<typeof memberPushSubscribeInput>

export const memberPushUnsubscribeInput = z.object({ endpoint: z.string().max(2000) })
export const memberNotificationsOpenedInput = z.object({ kind: z.enum(['follow_posts', 'weekend', 'reminder']) })

function requireMember(ctx: ActionContext, verb: string): string {
  if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') throw new AuthorizationError(`${verb}: a signed-in member is required`)
  return ctx.actingMemberId
}

type Row = { follow_posts: boolean; weekend: boolean; paused: boolean; quiet_start: number; quiet_end: number; remind_evening: boolean; remind_hour: boolean }
const toPrefs = (r: Row | undefined): Prefs =>
  r
    ? { followPosts: r.follow_posts, weekend: r.weekend, paused: r.paused, quietStart: r.quiet_start, quietEnd: r.quiet_end, remindEvening: r.remind_evening, remindHour: r.remind_hour }
    : { ...DEFAULT_PREFS }

const isOn = (p: Prefs, k: NotifyKind) => (k === 'follow_posts' ? p.followPosts : p.weekend)

/** What one change adds to this week's counts, per kind. Pause counts as a mute of every kind that was on. */
export function countsFor(before: Prefs, after: Prefs): { kind: NotifyKind; field: 'opt_ins' | 'unsubscribes' | 'mutes' }[] {
  const out: { kind: NotifyKind; field: 'opt_ins' | 'unsubscribes' | 'mutes' }[] = []
  for (const k of NOTIFY_KINDS) {
    if (!isOn(before, k) && isOn(after, k)) out.push({ kind: k, field: 'opt_ins' })
    if (isOn(before, k) && !isOn(after, k)) out.push({ kind: k, field: 'unsubscribes' })
    if (!before.paused && after.paused && isOn(after, k)) out.push({ kind: k, field: 'mutes' })
  }
  return out
}

export const memberNotificationsSet = defineHandler(
  'member.notifications.set',
  memberNotificationsSetInput,
  async (ctx: ActionContext, input: MemberNotificationsSetInput): Promise<Prefs> => {
    const memberId = requireMember(ctx, 'member.notifications.set')
    return withTransaction(async (client) => {
      const found = await client.query<Row>(
        `select follow_posts, weekend, paused, quiet_start, quiet_end, remind_evening, remind_hour from public.notification_prefs where member_id = $1 for update`,
        [memberId],
      )
      const before = toPrefs(found.rows[0])
      const after: Prefs = { ...before, ...input }
      await client.query(
        `insert into public.notification_prefs (member_id, follow_posts, weekend, paused, quiet_start, quiet_end, remind_evening, remind_hour, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (member_id) do update
           set follow_posts = excluded.follow_posts, weekend = excluded.weekend, paused = excluded.paused,
               quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end,
               remind_evening = excluded.remind_evening, remind_hour = excluded.remind_hour, updated_at = excluded.updated_at`,
        [memberId, after.followPosts, after.weekend, after.paused, after.quietStart, after.quietEnd, after.remindEvening, after.remindHour, ctx.now()],
      )
      for (const c of countsFor(before, after)) await client.query(`select public.notification_count($1, $2, 1)`, [c.kind, c.field])
      return after
    })
  },
)

export const memberPushSubscribe = defineHandler(
  'member.push.subscribe',
  memberPushSubscribeInput,
  async (ctx: ActionContext, input: MemberPushSubscribeInput): Promise<{ saved: true }> => {
    const memberId = requireMember(ctx, 'member.push.subscribe')
    return withTransaction(async (client) => {
      // An endpoint belongs to one browser; a different member signing in on it takes it over.
      await client.query(
        `insert into public.push_subscriptions (member_id, endpoint, p256dh, auth, platform, created_at)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (endpoint) do update
           set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth, platform = excluded.platform`,
        [memberId, input.endpoint, input.p256dh, input.auth, input.platform, ctx.now()],
      )
      return { saved: true as const }
    })
  },
)

export const memberPushUnsubscribe = defineHandler(
  'member.push.unsubscribe',
  memberPushUnsubscribeInput,
  async (ctx: ActionContext, input: { endpoint: string }): Promise<{ removed: boolean }> => {
    const memberId = requireMember(ctx, 'member.push.unsubscribe')
    return withTransaction(async (client) => {
      const res = await client.query(`delete from public.push_subscriptions where member_id = $1 and endpoint = $2`, [memberId, input.endpoint])
      return { removed: (res.rowCount ?? 0) > 0 }
    })
  },
)

export const memberNotificationsOpened = defineHandler(
  'member.notifications.opened',
  memberNotificationsOpenedInput,
  async (ctx: ActionContext, input: { kind: CountKind }): Promise<{ counted: true }> => {
    requireMember(ctx, 'member.notifications.opened')
    return withTransaction(async (client) => {
      await client.query(`select public.notification_count($1, 'opens', 1)`, [input.kind])
      return { counted: true as const }
    })
  },
)

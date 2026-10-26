// #945 (Don, 2026-10-18) — Remind me on a dated post.
//   member.reminder.set              this one, or every time for a post that repeats. Idempotent.
//   member.reminder.remove           only by its member.
//   member.reminder.every_for_page   following a Page that repeats: every time, for each of its series, in one tap;
//                                    for a vendor at markets (#955), each market it sells at.
// Reminders are private (post_reminders: a member reads their own). Each set or removal adds to the week's counts.

import { remindVenueFollowers } from '@/lib/unclaimed/venue-events'
import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'

export const memberReminderSetInput = z.object({ postId: z.string().uuid(), every: z.boolean() })
export const memberReminderRemoveInput = z.object({ reminderId: z.string().uuid() })
export const memberReminderEveryForPageInput = z.object({ groupId: z.string().uuid() })

export const NOTHING_TO_REMIND = 'This post has no date to remind you of.'
export const DOES_NOT_REPEAT = 'This post doesn’t repeat.'

function requireMember(ctx: ActionContext, verb: string): string {
  if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') throw new AuthorizationError(`${verb}: a signed-in member is required`)
  return ctx.actingMemberId
}

export const memberReminderSet = defineHandler(
  'member.reminder.set',
  memberReminderSetInput,
  async (ctx: ActionContext, input: { postId: string; every: boolean }): Promise<{ reminderId: string }> => {
    const memberId = requireMember(ctx, 'member.reminder.set')
    return withTransaction(async (client) => {
      // A real, live, dated post on a live Page this member may see (a private Page's post only to its members).
      const found = await client.query<{ starts_at: Date | null; series_id: string | null }>(
        `select p.starts_at, p.series_id
           from public.page_posts p join public.groups g on g.id = p.group_id
          where p.id = $1 and p.sample_kind is null and p.lifecycle_state = 'active' and p.dissolved_at is null
            and p.hidden_at is null and p.removed_at is null
            and g.lifecycle_state = 'active' and g.dissolved_at is null and g.unclaimed_hidden_at is null
            and (p.discoverability = 'listed'
                 or exists (select 1 from public.group_memberships m where m.group_id = g.id and m.member_id = $2 and m.left_at is null))`,
        [input.postId, memberId],
      )
      const post = found.rows[0]
      if (!post) throw new NotFoundError('member.reminder.set: no such post')
      if (!post.starts_at) throw new ValidationError(NOTHING_TO_REMIND)
      if (input.every && !post.series_id) throw new ValidationError(DOES_NOT_REPEAT)
      const target = input.every ? { col: 'series_id', id: post.series_id } : { col: 'post_id', id: input.postId }
      const existing = await client.query<{ id: string }>(
        input.every
          ? `select id from public.post_reminders where member_id = $1 and series_id = $2`
          : `select id from public.post_reminders where member_id = $1 and post_id = $2`,
        [memberId, target.id],
      )
      if (existing.rows[0]) return { reminderId: existing.rows[0].id }
      const made = await client.query<{ id: string }>(
        input.every
          ? `insert into public.post_reminders (member_id, series_id, created_at) values ($1, $2, $3) returning id`
          : `insert into public.post_reminders (member_id, post_id, created_at) values ($1, $2, $3) returning id`,
        [memberId, target.id, ctx.now()],
      )
      await client.query(`select public.notification_count('reminder', 'opt_ins', 1)`)
      return { reminderId: made.rows[0]!.id }
    })
  },
)

export const memberReminderRemove = defineHandler(
  'member.reminder.remove',
  memberReminderRemoveInput,
  async (ctx: ActionContext, input: { reminderId: string }): Promise<{ removed: boolean }> => {
    const memberId = requireMember(ctx, 'member.reminder.remove')
    return withTransaction(async (client) => {
      const res = await client.query(`delete from public.post_reminders where id = $1 and member_id = $2`, [input.reminderId, memberId])
      const removed = (res.rowCount ?? 0) > 0
      if (removed) await client.query(`select public.notification_count('reminder', 'unsubscribes', 1)`)
      return { removed }
    })
  },
)

export const memberReminderEveryForPage = defineHandler(
  'member.reminder.every_for_page',
  memberReminderEveryForPageInput,
  async (ctx: ActionContext, input: { groupId: string }): Promise<{ added: number }> => {
    const memberId = requireMember(ctx, 'member.reminder.every_for_page')
    return withTransaction(async (client) => {
      // Each series on this Page that still has a live, real post: the same test member.reminder.set applies.
      const res = await client.query(
        `insert into public.post_reminders (member_id, series_id, created_at)
         select distinct $2::uuid, s.id, $3::timestamptz
           from public.post_series s
           join public.groups g on g.id = s.group_id
          where s.group_id = $1 and g.lifecycle_state = 'active' and g.dissolved_at is null and g.unclaimed_hidden_at is null
            and (s.ends_on is null or s.ends_on >= (now() at time zone 'America/Los_Angeles')::date)
            and exists (select 1 from public.page_posts p
                         where p.series_id = s.id and p.sample_kind is null and p.lifecycle_state = 'active' and p.dissolved_at is null
                           and p.hidden_at is null and p.removed_at is null
                           and (p.discoverability = 'listed'
                                or exists (select 1 from public.group_memberships m where m.group_id = g.id and m.member_id = $2 and m.left_at is null)))
         on conflict do nothing`,
        [input.groupId, memberId, ctx.now()],
      )
      // #955 — a vendor Page: the evening before each market day it is at.
      const stalls = await client.query(
        `insert into public.post_reminders (member_id, stall_id, created_at)
         select $2::uuid, s.id, $3::timestamptz from public.market_stalls s where s.vendor_group_id = $1
         on conflict do nothing`,
        [input.groupId, memberId, ctx.now()],
      )
      // #997 — a venue: every show it lists, those posted now and each one imported later (remindVenueFollowers).
      const shows = await client.query(
        `insert into public.post_reminders (member_id, shows_group_id, created_at)
         select $2::uuid, g.id, $3::timestamptz from public.groups g
          where g.id = $1 and g.lifecycle_state = 'active' and g.dissolved_at is null and g.unclaimed_hidden_at is null
            and exists (select 1 from public.page_posts p where p.group_id = g.id and p.event_key is not null and p.dissolved_at is null)
         on conflict do nothing`,
        [input.groupId, memberId, ctx.now()],
      )
      if (shows.rowCount) await remindVenueFollowers(client, input.groupId, ctx.now())
      const added = (res.rowCount ?? 0) + (stalls.rowCount ?? 0) + (shows.rowCount ?? 0)
      if (added) await client.query(`select public.notification_count('reminder', 'opt_ins', $1)`, [added])
      return { added }
    })
  },
)


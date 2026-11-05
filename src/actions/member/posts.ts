// #1183 (plan #270, Don ruled B) — a member posts without a Page.
//   member_post.create    one of three kinds, in a neighborhood; the phone check first ([always], 2026-10-31)
//   member_post.withdraw  the poster takes it down
//   member_post.answer    "I'm interested" / "I saw it", in place of comments; only the poster sees who
// A post lives 7 or 14 days (a yard sale also ends with its day), and a member has a few up at once.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import { appendEvent } from '../_lib/event-log'
import type { ActionContext } from '../_lib/context'
import { ensureLabelRows, labelsInput, labelsPinnedInput, storedLabels } from '../group/labels'
import { KIND_DAYS, MAX_LIVE_POSTS, MEMBER_POST_KINDS } from '@/lib/member-posts/kinds'
import { listedUnder, toStoredTags } from '@/lib/labels/match'
import { METRO_TIME_ZONE, metroWallTimeToInstant } from '@/lib/metro/metro-time'
import { metroDate, shiftDays } from '@/lib/metro/metro-week'

const DAY_MS = 86_400_000

export const MEMBER_POST_REFUSED = {
  phone: 'Confirm your phone number before you post.',
  cap: `You have ${MAX_LIVE_POSTS} posts up. Take one down to post another.`,
  place: 'Pick a neighborhood.',
  street: 'A street goes only on a sale with its day.',
  day: 'Pick a day in the next two weeks.',
} as const

export const memberPostCreateInput = z
  .object({
    kind: z.enum(MEMBER_POST_KINDS),
    body: z.string().trim().min(1).max(1000),
    placeId: z.string().uuid(),
    saleOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    street: z.string().trim().min(1).max(120).optional(),
    tags: labelsInput,
    labelsPinned: labelsPinnedInput,
  })
  .strict()
export type MemberPostCreateInput = z.infer<typeof memberPostCreateInput>

export const memberPostWithdrawInput = z.object({ postId: z.string().uuid() }).strict()
export const memberPostAnswerInput = z.object({ postId: z.string().uuid(), on: z.boolean() }).strict()

function requireMember(ctx: ActionContext, verb: string): string {
  if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') throw new AuthorizationError(`${verb}: a signed-in member is required`)
  return ctx.actingMemberId
}

/** When it comes down: its kind's life, or the end of its sale day if that is sooner. */
function expiresAt(input: MemberPostCreateInput, now: Date): Date {
  const life = new Date(now.getTime() + KIND_DAYS[input.kind] * DAY_MS)
  if (!input.saleOn) return life
  const today = metroDate(now, METRO_TIME_ZONE)
  if (input.saleOn < today || input.saleOn > shiftDays(today, KIND_DAYS.free_sale)) throw new ValidationError(MEMBER_POST_REFUSED.day)
  const end = Date.parse(metroWallTimeToInstant(shiftDays(input.saleOn, 1), '00:00', METRO_TIME_ZONE) ?? '')
  return end < life.getTime() ? new Date(end) : life
}

export const memberPostCreate = defineHandler(
  'member_post.create',
  memberPostCreateInput,
  async (ctx: ActionContext, input: MemberPostCreateInput): Promise<{ postId: string }> => {
    const memberId = requireMember(ctx, 'member_post.create')
    if (input.saleOn && input.kind !== 'free_sale') throw new ValidationError(MEMBER_POST_REFUSED.street)
    if (input.street && !input.saleOn) throw new ValidationError(MEMBER_POST_REFUSED.street)
    const now = ctx.now()
    const expires = expiresAt(input, now)
    // None sent: listed by its words, else Neighborhood life.
    const labels = input.tags?.length ? storedLabels(input.tags) : toStoredTags(listedUnder({ text: input.body }))
    return withTransaction(async (client) => {
      const who = await client.query<{ phone: boolean }>(
        `select u.phone_confirmed_at is not null or public.is_builder(u.id) as phone from auth.users u where u.id = $1`,
        [memberId],
      )
      if (!who.rows[0]?.phone) throw new ValidationError(MEMBER_POST_REFUSED.phone)
      const place = await client.query(`select 1 from public.places where id = $1 and kind = 'neighborhood' and deleted_at is null`, [input.placeId])
      if (!place.rows[0]) throw new ValidationError(MEMBER_POST_REFUSED.place)
      // Serializes one member's posts, so two at once cannot both slip under the cap.
      await client.query(`select 1 from public.members where id = $1 for update`, [memberId])
      const live = await client.query<{ n: number }>(
        `select count(*)::int as n from public.member_posts
          where member_id = $1 and withdrawn_at is null and removed_at is null and expires_at > $2`,
        [memberId, now],
      )
      if ((live.rows[0]?.n ?? 0) >= MAX_LIVE_POSTS) throw new ValidationError(MEMBER_POST_REFUSED.cap)
      const res = await client.query<{ id: string }>(
        `insert into public.member_posts (member_id, kind, body, place_id, sale_on, street, labels_pinned, created_at, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [memberId, input.kind, input.body, input.placeId, input.saleOn ?? null, input.street ?? null, Boolean(input.labelsPinned), now, expires],
      )
      const postId = res.rows[0]!.id
      for (const normalized of await ensureLabelRows(client, labels, memberId)) {
        await client.query(
          `insert into public.member_post_tags (post_id, tag_id) select $1, t.id from public.tags t where t.normalized = $2 on conflict do nothing`,
          [postId, normalized],
        )
      }
      await appendEvent({ ...ctx, db: client }, 'member_events', {
        member_id: memberId,
        event_kind: 'member.post_created',
        payload: { post_id: postId, kind: input.kind },
      })
      return { postId }
    })
  },
)

export const memberPostWithdraw = defineHandler(
  'member_post.withdraw',
  memberPostWithdrawInput,
  async (ctx: ActionContext, input: { postId: string }): Promise<{ ok: true }> => {
    const memberId = requireMember(ctx, 'member_post.withdraw')
    return withTransaction(async (client) => {
      const res = await client.query(
        `update public.member_posts set withdrawn_at = coalesce(withdrawn_at, $3) where id = $1 and member_id = $2 returning id`,
        [input.postId, memberId, ctx.now()],
      )
      if (!res.rows[0]) throw new NotFoundError('member_post.withdraw: no such post of yours')
      await appendEvent({ ...ctx, db: client }, 'member_events', {
        member_id: memberId,
        event_kind: 'member.post_withdrawn',
        payload: { post_id: input.postId },
      })
      return { ok: true as const }
    })
  },
)

export const memberPostAnswer = defineHandler(
  'member_post.answer',
  memberPostAnswerInput,
  async (ctx: ActionContext, input: { postId: string; on: boolean }): Promise<{ on: boolean }> => {
    const memberId = requireMember(ctx, 'member_post.answer')
    return withTransaction(async (client) => {
      if (!input.on) {
        await client.query(`delete from public.member_post_responses where post_id = $1 and member_id = $2`, [input.postId, memberId])
        return { on: false }
      }
      const live = await client.query(
        `select 1 from public.member_posts
          where id = $1 and member_id <> $2 and withdrawn_at is null and hidden_at is null and removed_at is null and expires_at > $3`,
        [input.postId, memberId, ctx.now()],
      )
      if (!live.rows[0]) throw new NotFoundError('member_post.answer: no such post')
      await client.query(
        `insert into public.member_post_responses (post_id, member_id, created_at) values ($1, $2, $3) on conflict do nothing`,
        [input.postId, memberId, ctx.now()],
      )
      return { on: true }
    })
  },
)

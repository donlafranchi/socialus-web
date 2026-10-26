// F117 — Wonders: "I'm in" with a size, "I can help as <role>", the poster accepting or declining.
//   wonder.join             join, or change size. One row per member per Wonder.
//   wonder.leave            leave. Idempotent.
//   wonder.offer            offer one or more of the eight roles, with an optional one-line note.
//   wonder.offer_withdraw   only by its member.
//   wonder.offer_decide     accept or decline; only the Page's managers.
// The count on the post is rewritten in the same transaction as the row, so it never drifts.
// Nothing here takes, holds or promises payment (criterion 9).

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'
import { WONDER_ROLES, WONDER_NOTE_MAX } from '../../lib/wonders/roles'
import { COPY } from '../../lib/copy'

export const PICK_A_SIZE = COPY.wonderPickSizeError

const postId = z.string().uuid()
export const wonderJoinInput = z.object({ postId, option: z.string().trim().max(40).nullable().optional() })
export const wonderLeaveInput = z.object({ postId })
export const wonderOfferInput = z.object({
  postId,
  roles: z.array(z.enum(WONDER_ROLES)).min(1).max(WONDER_ROLES.length),
  note: z.string().trim().max(WONDER_NOTE_MAX).nullable().optional(),
})
export const wonderOfferWithdrawInput = z.object({ offerId: z.string().uuid() })
export const wonderOfferDecideInput = z.object({ offerId: z.string().uuid(), decision: z.enum(['accepted', 'declined']) })

type Client = { query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number }> }

function requireMember(ctx: ActionContext, verb: string): string {
  if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') throw new AuthorizationError(`${verb}: a signed-in member is required`)
  return ctx.actingMemberId
}

/** A Wonder this member can see: live and listed on a live, listed Page, or on a Page they manage. Locked for the count. */
async function requireWonder(client: Client, verb: string, id: string, memberId: string) {
  const found = await client.query<{ options: string[] | null }>(
    `select p.wonder_options as options
       from public.page_posts p join public.groups g on g.id = p.group_id
      where p.id = $1 and p.kind = 'wonder' and p.dissolved_at is null
        and (
          exists (select 1 from public.group_memberships m
                   where m.group_id = g.id and m.member_id = $2 and m.left_at is null
                     and m.role = case when g.kind = 'business' then 'owner' else 'steward' end)
          or (p.lifecycle_state = 'active' and p.discoverability = 'listed' and p.hidden_at is null and p.removed_at is null
              and g.lifecycle_state = 'active' and g.discoverability = 'listed' and g.dissolved_at is null)
        )
      for update of p`,
    [id, memberId],
  )
  const w = found.rows[0]
  if (!w) throw new NotFoundError(`${verb}: no such Wonder`)
  return w
}

async function recount(client: Client, id: string): Promise<number> {
  const r = await client.query<{ n: number }>(
    `update public.page_posts set wonder_in_count = (select count(*) from public.wonder_interest where post_id = $1)
      where id = $1 returning wonder_in_count as n`,
    [id],
  )
  return r.rows[0]!.n
}

export const wonderJoin = defineHandler(
  'wonder.join',
  wonderJoinInput,
  async (ctx: ActionContext, input: z.infer<typeof wonderJoinInput>): Promise<{ inCount: number }> => {
    const memberId = requireMember(ctx, 'wonder.join')
    return withTransaction(async (client) => {
      const w = await requireWonder(client, 'wonder.join', input.postId, memberId)
      const option = input.option?.trim() || null
      if (w.options?.length ? !option || !w.options.includes(option) : option !== null) throw new ValidationError(PICK_A_SIZE)
      await client.query(
        `insert into public.wonder_interest (post_id, member_id, option, created_at, updated_at) values ($1, $2, $3, $4, $4)
         on conflict (post_id, member_id) do update set option = excluded.option, updated_at = excluded.updated_at`,
        [input.postId, memberId, option, ctx.now()],
      )
      return { inCount: await recount(client, input.postId) }
    })
  },
)

export const wonderLeave = defineHandler(
  'wonder.leave',
  wonderLeaveInput,
  async (ctx: ActionContext, input: z.infer<typeof wonderLeaveInput>): Promise<{ inCount: number }> => {
    const memberId = requireMember(ctx, 'wonder.leave')
    return withTransaction(async (client) => {
      await requireWonder(client, 'wonder.leave', input.postId, memberId)
      await client.query(`delete from public.wonder_interest where post_id = $1 and member_id = $2`, [input.postId, memberId])
      return { inCount: await recount(client, input.postId) }
    })
  },
)

export const wonderOffer = defineHandler(
  'wonder.offer',
  wonderOfferInput,
  async (ctx: ActionContext, input: z.infer<typeof wonderOfferInput>): Promise<{ offerIds: string[] }> => {
    const memberId = requireMember(ctx, 'wonder.offer')
    return withTransaction(async (client) => {
      await requireWonder(client, 'wonder.offer', input.postId, memberId)
      const note = input.note?.trim() || null
      const offerIds: string[] = []
      // An offer already made keeps its status; a new note replaces the old one only while it is pending.
      for (const role of new Set(input.roles)) {
        const r = await client.query<{ id: string }>(
          `insert into public.wonder_offers (post_id, member_id, role, note, created_at) values ($1, $2, $3, $4, $5)
           on conflict (post_id, member_id, role) do update
             set note = case when public.wonder_offers.status = 'pending' then coalesce(excluded.note, public.wonder_offers.note) else public.wonder_offers.note end
           returning id`,
          [input.postId, memberId, role, note, ctx.now()],
        )
        offerIds.push(r.rows[0]!.id)
      }
      return { offerIds }
    })
  },
)

export const wonderOfferWithdraw = defineHandler(
  'wonder.offer_withdraw',
  wonderOfferWithdrawInput,
  async (ctx: ActionContext, input: z.infer<typeof wonderOfferWithdrawInput>): Promise<{ withdrawn: boolean }> => {
    const memberId = requireMember(ctx, 'wonder.offer_withdraw')
    return withTransaction(async (client) => {
      const r = await client.query(`delete from public.wonder_offers where id = $1 and member_id = $2`, [input.offerId, memberId])
      return { withdrawn: (r.rowCount ?? 0) > 0 }
    })
  },
)

export const wonderOfferDecide = defineHandler(
  'wonder.offer_decide',
  wonderOfferDecideInput,
  async (ctx: ActionContext, input: z.infer<typeof wonderOfferDecideInput>): Promise<{ offerId: string; status: string }> => {
    const memberId = requireMember(ctx, 'wonder.offer_decide')
    return withTransaction(async (client) => {
      const found = await client.query<{ manages: boolean }>(
        `select exists (select 1 from public.group_memberships m
                         where m.group_id = g.id and m.member_id = $2 and m.left_at is null
                           and m.role = case when g.kind = 'business' then 'owner' else 'steward' end) as manages
           from public.wonder_offers o
           join public.page_posts p on p.id = o.post_id and p.dissolved_at is null
           join public.groups g on g.id = p.group_id
          where o.id = $1`,
        [input.offerId, memberId],
      )
      const row = found.rows[0]
      if (!row) throw new NotFoundError('wonder.offer_decide: no such offer')
      if (!row.manages) throw new AuthorizationError('wonder.offer_decide: only the people who manage this Page can accept helpers')
      await client.query(`update public.wonder_offers set status = $2, decided_at = $3 where id = $1`, [input.offerId, input.decision, ctx.now()])
      return { offerId: input.offerId, status: input.decision }
    })
  },
)

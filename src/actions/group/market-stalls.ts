// #955 (Don, 2026-10-18: "Go") — a vendor Page at a market Page.
//   group.market_stall.set      the vendor's managers: which market, every market day or listed dates. Idempotent.
//   group.market_stall.skip     the vendor's managers: "skipping this week" for one date, or undo it.
//   group.market_stall.remove   the vendor's managers, or the market's once it is claimed.
//   group.market_stall.confirm  the market's managers, once it is claimed.
// A market is a live Page with a weekly series of real dated posts. Any vendor may attach to one, claimed or not;
// a false attachment is reported from the vendor Page's menu (F078) or removed by the market's organiser.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'

type Q = { query: <R = Record<string, unknown>>(sql: string, p?: unknown[]) => Promise<{ rows: R[]; rowCount: number | null }> }
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const marketStallSetInput = z.object({
  vendorGroupId: z.string().uuid(),
  marketGroupId: z.string().uuid(),
  everyWeek: z.boolean(),
  dates: z.array(ymd).max(52),
})
export const marketStallSkipInput = z.object({ stallId: z.string().uuid(), date: ymd, skip: z.boolean() })
export const marketStallIdInput = z.object({ stallId: z.string().uuid() })

export const NOT_A_MARKET = 'That Page has no market days to sell at.'
export const PICK_A_DATE = 'Pick at least one date.'
export const NOT_ITSELF = 'A Page can’t sell at itself.'

function requireMember(ctx: ActionContext, verb: string): string {
  if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') throw new AuthorizationError(`${verb}: a signed-in member is required`)
  return ctx.actingMemberId
}

const manages = async (c: Q, groupId: string, memberId: string) =>
  (
    await c.query(
      `select 1 from public.groups g join public.group_memberships m on m.group_id = g.id
        where g.id = $1 and m.member_id = $2 and m.left_at is null
          and m.role = case when g.kind = 'business' then 'owner' else 'steward' end`,
      [groupId, memberId],
    )
  ).rows.length > 0

async function stallOf(c: Q, stallId: string) {
  const r = await c.query<{ vendor_group_id: string; market_group_id: string; market_claimed: boolean }>(
    `select s.vendor_group_id, s.market_group_id, (g.unclaimed_at is null) as market_claimed
       from public.market_stalls s join public.groups g on g.id = s.market_group_id where s.id = $1`,
    [stallId],
  )
  if (!r.rows[0]) throw new NotFoundError('market stall not found')
  return r.rows[0]
}

export const groupMarketStallSet = defineHandler(
  'group.market_stall.set',
  marketStallSetInput,
  async (ctx: ActionContext, input: z.infer<typeof marketStallSetInput>): Promise<{ stallId: string }> => {
    const memberId = requireMember(ctx, 'group.market_stall.set')
    if (input.vendorGroupId === input.marketGroupId) throw new ValidationError(NOT_ITSELF)
    if (!input.everyWeek && !input.dates.length) throw new ValidationError(PICK_A_DATE)
    return withTransaction(async (client) => {
      if (!(await manages(client, input.vendorGroupId, memberId))) throw new AuthorizationError('group.market_stall.set: only the Page’s managers')
      const market = await client.query(
        `select 1 from public.groups g
          where g.id = $1 and g.lifecycle_state = 'active' and g.dissolved_at is null and g.unclaimed_hidden_at is null
            and exists (select 1 from public.post_series s join public.page_posts p on p.series_id = s.id
                         where s.group_id = g.id and p.sample_kind is null and p.lifecycle_state = 'active'
                           and p.dissolved_at is null and p.discoverability = 'listed')`,
        [input.marketGroupId],
      )
      if (!market.rows.length) throw new ValidationError(NOT_A_MARKET)
      const dates = [...new Set(input.dates)].sort()
      const r = await client.query<{ id: string }>(
        `insert into public.market_stalls (vendor_group_id, market_group_id, every_week, dates, created_by, created_at, updated_at)
         values ($1, $2, $3, $4::date[], $5, $6, $6)
         on conflict (vendor_group_id, market_group_id)
         do update set every_week = excluded.every_week, dates = excluded.dates, updated_at = excluded.updated_at
         returning id`,
        [input.vendorGroupId, input.marketGroupId, input.everyWeek, input.everyWeek ? [] : dates, memberId, ctx.now()],
      )
      return { stallId: r.rows[0]!.id }
    })
  },
)

export const groupMarketStallSkip = defineHandler(
  'group.market_stall.skip',
  marketStallSkipInput,
  async (ctx: ActionContext, input: z.infer<typeof marketStallSkipInput>): Promise<{ skipping: boolean }> => {
    const memberId = requireMember(ctx, 'group.market_stall.skip')
    return withTransaction(async (client) => {
      const s = await stallOf(client, input.stallId)
      if (!(await manages(client, s.vendor_group_id, memberId))) throw new AuthorizationError('group.market_stall.skip: only the vendor’s managers')
      await client.query(
        input.skip
          ? `update public.market_stalls set skip_dates = (select array_agg(distinct d order by d) from unnest(skip_dates || $2::date) d), updated_at = $3 where id = $1`
          : `update public.market_stalls set skip_dates = array_remove(skip_dates, $2::date), updated_at = $3 where id = $1`,
        [input.stallId, input.date, ctx.now()],
      )
      return { skipping: input.skip }
    })
  },
)

export const groupMarketStallRemove = defineHandler(
  'group.market_stall.remove',
  marketStallIdInput,
  async (ctx: ActionContext, input: { stallId: string }): Promise<{ removed: boolean }> => {
    const memberId = requireMember(ctx, 'group.market_stall.remove')
    return withTransaction(async (client) => {
      const s = await stallOf(client, input.stallId)
      const ok = (await manages(client, s.vendor_group_id, memberId)) || (s.market_claimed && (await manages(client, s.market_group_id, memberId)))
      if (!ok) throw new AuthorizationError('group.market_stall.remove: only the vendor’s or the market’s managers')
      const r = await client.query(`delete from public.market_stalls where id = $1`, [input.stallId])
      return { removed: (r.rowCount ?? 0) > 0 }
    })
  },
)

export const groupMarketStallConfirm = defineHandler(
  'group.market_stall.confirm',
  marketStallIdInput,
  async (ctx: ActionContext, input: { stallId: string }): Promise<{ confirmed: boolean }> => {
    const memberId = requireMember(ctx, 'group.market_stall.confirm')
    return withTransaction(async (client) => {
      const s = await stallOf(client, input.stallId)
      if (!s.market_claimed || !(await manages(client, s.market_group_id, memberId))) throw new AuthorizationError('group.market_stall.confirm: only the market’s managers')
      await client.query(`update public.market_stalls set confirmed_at = coalesce(confirmed_at, $2) where id = $1`, [input.stallId, ctx.now()])
      return { confirmed: true }
    })
  },
)

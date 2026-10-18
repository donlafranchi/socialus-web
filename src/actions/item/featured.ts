// #909 — item.featured_save / item.featured_remove: a Page's featured products and services.
//
// Rows on the existing items spine, filed under the Page (group_id), always published: the owner decides to
// show one by adding it. The price lives where the spine already keeps it, item_products.price_cents for a
// product and item_services.rate_cents for a service ('quote' when there is none). The people who manage the
// Page may write, by the same role rule posts use (managingRoleForKind). Remove is soft (deleted_at). An edit to
// the words shows an item a report hid again (fix it and it shows, as #625 does for a Page's words).

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { withTransaction } from '../_lib/db'
import { appendEvent } from '../_lib/event-log'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'
import { anyContainsEmail, EMAIL_IN_PAGE_TEXT_MESSAGE } from '../../lib/text/contact-info'
import { isOwnMediaUrl } from '../../lib/media/own-media-url'
import { FEATURED_ITEMS_MAX } from '../../lib/items/featured'
import { managingRoleForKind, type GroupKind } from '../group/constants'

export const featuredItemSaveInput = z.object({
  groupId: z.string().uuid(),
  /** Absent adds one; present edits that one. */
  itemId: z.string().uuid().optional(),
  kind: z.enum(['product', 'service']),
  name: z.string().trim().min(1).max(80),
  details: z.string().trim().max(280).optional(),
  priceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  inStock: z.boolean().default(true),
  photoUrl: z.string().url().max(2000).nullable().optional(),
})
export type FeaturedItemSaveInput = z.input<typeof featuredItemSaveInput>

export const featuredItemRemoveInput = z.object({ groupId: z.string().uuid(), itemId: z.string().uuid() })
export type FeaturedItemRemoveInput = z.infer<typeof featuredItemRemoveInput>

interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>
}

function requireMember(ctx: ActionContext, verb: string): string {
  if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') {
    throw new AuthorizationError(`${verb}: a signed-in member is required`)
  }
  return ctx.actingMemberId
}

/** Locks the Page row, so two adds at once cannot both pass the limit. */
async function requireManagingRole(client: Queryable, verb: string, groupId: string, memberId: string) {
  const found = await client.query<{ kind: string; role: string | null }>(
    `select g.kind, m.role
       from public.groups g
       left join public.group_memberships m
         on m.group_id = g.id and m.member_id = $2 and m.left_at is null
      where g.id = $1 and g.dissolved_at is null
        for update of g`,
    [groupId, memberId],
  )
  const row = found.rows[0]
  if (!row) throw new NotFoundError(`${verb}: group ${groupId} not found or dissolved`)
  if (row.role !== managingRoleForKind(row.kind as GroupKind)) {
    throw new AuthorizationError(`${verb}: only the people who manage this Page can change its products and services`)
  }
}

async function writePrice(client: Queryable, itemId: string, kind: 'product' | 'service', priceCents: number | null) {
  if (kind === 'product') {
    await client.query(
      `insert into public.item_products (item_id, price_cents) values ($1, $2)
       on conflict (item_id) do update set price_cents = excluded.price_cents`,
      [itemId, priceCents],
    )
  } else {
    await client.query(
      `insert into public.item_services (item_id, rate_model, rate_cents) values ($1, $2, $3)
       on conflict (item_id) do update set rate_model = excluded.rate_model, rate_cents = excluded.rate_cents`,
      [itemId, priceCents == null ? 'quote' : 'flat', priceCents],
    )
  }
}

export const featuredItemSave = defineHandler(
  'item.featured_save',
  featuredItemSaveInput,
  async (ctx: ActionContext, raw: FeaturedItemSaveInput): Promise<{ itemId: string }> => {
    const input = featuredItemSaveInput.parse(raw)
    const memberId = requireMember(ctx, 'item.featured_save')
    if (anyContainsEmail(input.name, input.details)) throw new ValidationError(EMAIL_IN_PAGE_TEXT_MESSAGE)
    if (input.photoUrl && !isOwnMediaUrl(input.photoUrl, memberId)) {
      throw new ValidationError('That photo didn’t come from your uploads.')
    }
    const price = input.priceCents ?? null

    return withTransaction(async (client) => {
      const txCtx: ActionContext = { ...ctx, db: client }
      await requireManagingRole(client, 'item.featured_save', input.groupId, memberId)

      if (input.itemId) {
        const found = await client.query<{ kind: string }>(
          `select i.kind
             from public.items i
            where i.id = $1 and i.group_id = $2 and i.deleted_at is null and i.kind in ('product', 'service')`,
          [input.itemId, input.groupId],
        )
        const was = found.rows[0]
        if (!was) throw new NotFoundError(`item.featured_save: item ${input.itemId} is not on this Page`)
        await client.query(
          `update public.items
              set hidden_at = case when title is distinct from $4 or description is distinct from $5 then null else hidden_at end,
                  removed_at = case when title is distinct from $4 or description is distinct from $5 then null else removed_at end,
                  kind = $3, title = $4, description = $5, in_stock = $6, photo_url = $7, updated_at = $8,
                  sample_source_url = null
            where id = $1 and group_id = $2`,
          [input.itemId, input.groupId, input.kind, input.name, input.details ?? '', input.inStock, input.photoUrl ?? null, ctx.now()],
        )
        if (was.kind !== input.kind) {
          await client.query(
            was.kind === 'product'
              ? `delete from public.item_products where item_id = $1`
              : `delete from public.item_services where item_id = $1`,
            [input.itemId],
          )
        }
        await writePrice(client, input.itemId, input.kind, price)
        await appendEvent(txCtx, 'item_events', { item_id: input.itemId, event_kind: 'item.updated', payload: { featured: true } })
        return { itemId: input.itemId }
      }

      // An unclaimed Page's samples (#909) give way to the owner's first real one, as sample posts do (#556).
      await client.query(
        `update public.items set deleted_at = $2
          where group_id = $1 and sample_source_url is not null and deleted_at is null`,
        [input.groupId, ctx.now()],
      )
      const counted = await client.query<{ n: number; next: number }>(
        `select count(*)::int as n, coalesce(max(position) + 1, 0)::int as next
           from public.items
          where group_id = $1 and deleted_at is null and kind in ('product', 'service')`,
        [input.groupId],
      )
      const { n, next } = counted.rows[0] ?? { n: 0, next: 0 }
      if (n >= FEATURED_ITEMS_MAX) {
        throw new ValidationError(`A Page shows up to ${FEATURED_ITEMS_MAX}. Remove one to add another.`)
      }
      const made = await client.query<{ id: string }>(
        `insert into public.items
           (member_id, kind, group_id, title, description, state, in_stock, position, photo_url, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
         returning id`,
        [memberId, input.kind, input.groupId, input.name, input.details ?? '', 'published', input.inStock, next, input.photoUrl ?? null, ctx.now()],
      )
      const itemId = made.rows[0]!.id
      await writePrice(client, itemId, input.kind, price)
      await appendEvent(txCtx, 'item_events', { item_id: itemId, event_kind: 'item.created', payload: { featured: true } })
      return { itemId }
    })
  },
)

export const featuredItemRemove = defineHandler(
  'item.featured_remove',
  featuredItemRemoveInput,
  async (ctx: ActionContext, input: FeaturedItemRemoveInput): Promise<{ itemId: string }> => {
    const memberId = requireMember(ctx, 'item.featured_remove')
    return withTransaction(async (client) => {
      await requireManagingRole(client, 'item.featured_remove', input.groupId, memberId)
      const r = await client.query<{ id: string }>(
        `update public.items set deleted_at = $3
          where id = $1 and group_id = $2 and deleted_at is null and kind in ('product', 'service')
          returning id`,
        [input.itemId, input.groupId, ctx.now()],
      )
      if (r.rows.length === 0) throw new NotFoundError(`item.featured_remove: item ${input.itemId} is not on this Page`)
      await appendEvent({ ...ctx, db: client }, 'item_events', { item_id: input.itemId, event_kind: 'item.deleted', payload: { featured: true } })
      return { itemId: input.itemId }
    })
  },
)

// #353 — an unclaimed Page (a real business added from public info, Don,
// 2026-10-04): anyone can ask to remove it or claim it, signed in or out, and
// an operator restores one that was hidden.
//
// A REMOVAL REQUEST HIDES THE PAGE AT ONCE, before anyone reviews it (Don's
// guardrail, stricter than Yelp, Google or Tripadvisor). Abuse protection never
// delays that hide: a device past its daily limit is refused outright, and only
// an operator can bring a Page back.
//
// These are the second anonymous write path after metro.waitlist_join_anonymous
// (F076). The account-only rule for reports (report/create.ts) still stands for
// member content; an unclaimed Page has no member behind it to ask, and the
// person it is about may never have an account (Don, 2026-10-04, newer).

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { ConflictError, NotFoundError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import { appendEvent } from '../_lib/event-log'
import { requirePermission } from '../_lib/staff'
import type { ActionContext } from '../_lib/context'
import { SYSTEM_MEMBER_ID } from '@/lib/system-member'

/** Requests per device per rolling day, each kind counted on its own. */
export const DAILY_LIMIT_PER_DEVICE = 3

const deviceHash = z.string().regex(/^[0-9a-f]{64}$/)
const contact = z.string().trim().min(3).max(200)

type Client = { query: <T>(sql: string, params: unknown[]) => Promise<{ rows: T[] }> }

async function requireUnclaimed(client: Client, groupId: string, verb: string): Promise<{ hidden: boolean }> {
  const res = await client.query<{ unclaimed_hidden_at: Date | null }>(
    `select unclaimed_hidden_at from public.groups where id = $1 and unclaimed_at is not null for update`,
    [groupId],
  )
  const row = res.rows[0]
  // A member's own Page answers exactly like a missing one: these paths exist
  // only for Pages nobody has claimed.
  if (!row) throw new NotFoundError(`${verb}: no unclaimed Page ${groupId}`)
  return { hidden: row.unclaimed_hidden_at !== null }
}

async function requireUnderLimit(client: Client, table: string, device: string, now: Date, verb: string) {
  // sql-injection-safe: `table` is one of two literals below.
  const res = await client.query<{ n: string }>(
    `select count(*) as n from public.${table} where device_hash = $1 and created_at > $2::timestamptz - interval '1 day'`,
    [device, now],
  )
  if (Number(res.rows[0]?.n ?? 0) >= DAILY_LIMIT_PER_DEVICE) {
    throw new ConflictError(`${verb}: daily limit reached`)
  }
}

export const UNCLAIMED_REMOVAL_SCOPES = ['page', 'photo'] as const
export type UnclaimedRemovalScope = (typeof UNCLAIMED_REMOVAL_SCOPES)[number]

export const groupUnclaimedRemoveInput = z.object({
  groupId: z.string().uuid(),
  // The whole Page, or just its photo (Don, 2026-10-05). Both hide at once.
  scope: z.enum(UNCLAIMED_REMOVAL_SCOPES).default('page'),
  contact,
  reason: z.string().trim().max(1000).optional(),
  // The tick. Without it there is no request.
  confirmed: z.literal(true),
  deviceHash,
})

export const groupUnclaimedRemove = defineHandler(
  'group.unclaimed_remove',
  groupUnclaimedRemoveInput,
  async (ctx: ActionContext, input): Promise<{ hidden: true }> => {
    // No identity read: signed out is the common case.
    return withTransaction(async (client) => {
      const { hidden } = await requireUnclaimed(client, input.groupId, 'group.unclaimed_remove')
      await requireUnderLimit(client, 'page_removal_requests', input.deviceHash, ctx.now(), 'group.unclaimed_remove')

      const req = await client.query<{ id: string }>(
        `insert into public.page_removal_requests (group_id, scope, contact, reason, device_hash, created_at)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [input.groupId, input.scope, input.contact, input.reason || null, input.deviceHash, ctx.now()],
      )
      // Recorded as the system's act; the request is who asked. Built field by
      // field: spreading an anonymous context reads its throwing actingMemberId.
      const sysCtx: ActionContext = {
        actingMemberId: SYSTEM_MEMBER_ID,
        viaDelegationId: null,
        traceId: ctx.traceId,
        db: client,
        now: ctx.now,
      }
      const payload = { removal_request_id: req.rows[0]!.id }
      if (input.scope === 'photo') {
        // The same column a report hides a photo with, so every surface already honours it.
        const res = await client.query(
          `update public.groups set photo_hidden_at = $2 where id = $1 and photo_hidden_at is null returning id`,
          [input.groupId, ctx.now()],
        )
        if (res.rows.length > 0) {
          await appendEvent(sysCtx, 'group_events', {
            group_id: input.groupId,
            event_kind: 'group.photo_hidden',
            payload: { ...payload, reason: 'unclaimed_removal' },
          })
        }
      } else if (!hidden) {
        await client.query(`update public.groups set unclaimed_hidden_at = $2 where id = $1`, [input.groupId, ctx.now()])
        await appendEvent(sysCtx, 'group_events', {
          group_id: input.groupId,
          event_kind: 'group.unclaimed_hidden',
          payload,
        })
      }
      return { hidden: true }
    })
  },
)

export const groupUnclaimedClaimInput = z.object({
  groupId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  contact,
  message: z.string().trim().max(2000).optional(),
  deviceHash,
})

export const groupUnclaimedClaim = defineHandler(
  'group.unclaimed_claim',
  groupUnclaimedClaimInput,
  async (ctx: ActionContext, input): Promise<{ received: true }> => {
    return withTransaction(async (client) => {
      await requireUnclaimed(client, input.groupId, 'group.unclaimed_claim')
      await requireUnderLimit(client, 'page_claim_requests', input.deviceHash, ctx.now(), 'group.unclaimed_claim')
      await client.query(
        `insert into public.page_claim_requests (group_id, name, contact, message, device_hash, created_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [input.groupId, input.name, input.contact, input.message || null, input.deviceHash, ctx.now()],
      )
      return { received: true }
    })
  },
)

export const groupUnclaimedRestoreInput = z.object({
  groupId: z.string().uuid(),
  scope: z.enum(UNCLAIMED_REMOVAL_SCOPES).default('page'),
})

export const groupUnclaimedRestore = defineHandler(
  'group.unclaimed_restore',
  groupUnclaimedRestoreInput,
  async (ctx: ActionContext, input): Promise<{ restored: boolean }> => {
    await requirePermission(ctx, 'unclaimed.manage', 'group.unclaimed_restore')
    return withTransaction(async (client) => {
      const column = input.scope === 'photo' ? 'photo_hidden_at' : 'unclaimed_hidden_at'
      // sql-injection-safe: `column` is one of two literals.
      const res = await client.query<{ id: string }>(
        `update public.groups set ${column} = null
          where id = $1 and unclaimed_at is not null and ${column} is not null returning id`,
        [input.groupId],
      )
      if (res.rows.length === 0) return { restored: false }
      await appendEvent({ ...ctx, db: client }, 'group_events', {
        group_id: input.groupId,
        event_kind: input.scope === 'photo' ? 'group.photo_restored' : 'group.unclaimed_restored',
      })
      return { restored: true }
    })
  },
)

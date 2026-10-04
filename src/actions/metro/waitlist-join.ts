// T163 (Issue #77) — metro.waitlist_join
// Scenario: planning/scenario-F076.md — "a person outside an open metro joins
// its waitlist"
//
// One person, one metro, one role. Joining again is not a second row: the
// unique constraint on `member_id` makes that impossible, which is what
// criterion 4 means by idempotent *by construction* rather than by
// application-side de-duplication. Changing metro is therefore an update, and
// criterion 5 — moving the count without stranding or double-counting — falls
// out of the same constraint rather than being separately enforced.
//
// The two counters on `metro_polygons` are maintained here, in the same
// transaction as the row, so a move can never leave the old metro high and the
// new one empty. They are stored separately (criterion 6) and read
// independently of the single combined number the popup shows.
//
// THIS HANDLER NEVER OPENS A METRO. Crossing a threshold makes a metro
// eligible; opening it is a deliberate act (criterion 12). Nothing here writes
// `is_open`, and a test asserts the absence.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, NotFoundError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'

/**
 * Exactly one of two, and no default. A default would be a pre-selection by
 * another name, and criterion 3 says neither role is pre-selected.
 */
export const WAITLIST_ROLES = ['creator', 'patron'] as const
export type WaitlistRole = (typeof WAITLIST_ROLES)[number]

export const metroWaitlistJoinInput = z.object({
  metroId: z.string().uuid(),
  role: z.enum(WAITLIST_ROLES),
})

export type MetroWaitlistJoinInput = z.infer<typeof metroWaitlistJoinInput>

export interface MetroWaitlistJoinResult {
  metroId: string
  role: WaitlistRole
  /** False when the person was already on this metro in this role. */
  changed: boolean
}

/** `creator` → `creator_count`. Kept here so the column names stay in one place. */
const COUNT_COLUMN: Record<WaitlistRole, string> = {
  creator: 'creator_count',
  patron: 'patron_count',
}

export const metroWaitlistJoin = defineHandler(
  'metro.waitlist_join',
  metroWaitlistJoinInput,
  async (
    ctx: ActionContext,
    input: MetroWaitlistJoinInput,
  ): Promise<MetroWaitlistJoinResult> => {
    if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') {
      throw new AuthorizationError('metro.waitlist_join: a signed-in member is required')
    }
    const memberId = ctx.actingMemberId

    return withTransaction(async (client) => {
      const metroRes = await client.query<{ id: string; is_open: boolean }>(
        `select id, is_open from public.metro_polygons where id = $1`,
        [input.metroId],
      )
      if (!metroRes.rows[0]) {
        throw new NotFoundError(`metro.waitlist_join: metro ${input.metroId} not found`)
      }

      // The person's existing choice, if any. Read inside the transaction so a
      // concurrent join cannot slip between the read and the write.
      const existingRes = await client.query<{ metro_id: string; role: WaitlistRole }>(
        `select metro_id, role from public.metro_waitlist where member_id = $1 for update`,
        [memberId],
      )
      const existing = existingRes.rows[0] ?? null

      // Already exactly here, in exactly this role. Nothing to write and
      // nothing to increment — a re-visit, a re-signup or a second device all
      // land here.
      if (existing && existing.metro_id === input.metroId && existing.role === input.role) {
        return { metroId: input.metroId, role: input.role, changed: false }
      }

      const bump = async (metroId: string, role: WaitlistRole, delta: 1 | -1) => {
        const column = COUNT_COLUMN[role]
        // `greatest(..., 0)` on the way down so a counter can never go
        // negative and trip its CHECK, even if a row was removed by a path
        // that did not decrement.
        // sql-injection-safe: `column` is indexed out of a literal map by a
        // Zod-validated enum, never from caller input.
        // #280 — a builder's place on a waitlist never counts.
        await client.query(
          delta === 1
            ? `update public.metro_polygons set ${column} = ${column} + 1, updated_at = $2 where id = $1 and not public.is_builder($3)`
            : `update public.metro_polygons set ${column} = greatest(${column} - 1, 0), updated_at = $2 where id = $1 and not public.is_builder($3)`,
          [metroId, ctx.now(), memberId],
        )
      }

      if (existing) {
        // A move: one row updated, the old count down, the new count up. Both
        // in this transaction, so the person is never counted twice and never
        // stranded on the metro they left.
        await client.query(
          `update public.metro_waitlist
              set metro_id = $2, role = $3, updated_at = $4
            where member_id = $1`,
          [memberId, input.metroId, input.role, ctx.now()],
        )
        await bump(existing.metro_id, existing.role, -1)
        await bump(input.metroId, input.role, 1)
      } else {
        await client.query(
          `insert into public.metro_waitlist (member_id, metro_id, role, created_at, updated_at)
           values ($1, $2, $3, $4, $4)`,
          [memberId, input.metroId, input.role, ctx.now()],
        )
        await bump(input.metroId, input.role, 1)
      }

      return { metroId: input.metroId, role: input.role, changed: true }
    })
  },
)

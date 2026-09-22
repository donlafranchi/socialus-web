// T167 (Issue #193) — metro.waitlist_join_anonymous
// Scenario: planning/scenario-F076.md criteria 13-15, amended 2026-09-21 —
// "a person who picks a metro that is not open can leave an email address to
// be told when it opens, without creating an account."
//
// WHY THIS IS NOT A BRANCH INSIDE metro.waitlist_join.
// That handler's entire shape is `ctx.actingMemberId`: it throws without one,
// locks its row `for update` by member, and keys both counter moves on that
// row. A caller here has no identity in the context at all, so threading a
// nullable member through it would turn every one of those guards into a
// conditional. Two handlers, one table, one set of constraints.
//
// THE UNIQUENESS KEY IS THE ADDRESS, GLOBALLY — NOT PER METRO.
// `metro_waitlist_email_unique` is on `lower(email)` with no metro in it, so
// one address cannot sit on Boise and Reno at once. Criterion 4 (one person
// counts once) and criterion 5 (changing metro MOVES the count) stay
// consequences of one index rather than becoming logic here, exactly as
// `member_id unique` does for a signed-in member.
//
// CRITERION 14, AND THE HALF OF IT THIS HANDLER DOES NOT DELIVER.
// A unique index on an email makes "is this address already waiting?" a
// question this endpoint can answer. SQL cannot fix that; the handler has to.
//
// What is delivered: the SHAPE of the result is identical whether the row was
// inserted, moved, or already exactly here. No flag, no second message, no
// different status. The result type has nowhere to put one.
//
// What is NOT delivered: THE COUNT. The counts are read before any write, per
// the rule the migration and #191 set down — and reading before the write does
// not do what that rule says it does. Submit a new address and the pre-write
// read returns N; submit the same address again and it returns N+1, because
// the first submission inserted. Criterion 14's own sentence — "a person who
// submits twice cannot tell that they had already submitted" — is therefore
// false here. Verified against local Postgres, not reasoned about: two
// submissions returned creatorCount 0, then 1.
//
// Reading AFTER the write inverts the problem rather than solving it: two
// submissions of one address then agree (N+1 both times), but a single probe
// of an address you do not own returns N+1 if it was new and N if it was not,
// which is a cheaper attack than the one it fixes.
//
// The honest statement is that ANY truthful live count leaks membership by
// differencing, and which way to trade that off is a product ruling with an
// acceptance check behind it — Issue #196, routed to `plan`. Read-before-write
// is kept meanwhile because it is what the applied migration documents, and
// because it is the better of the two against a single probe.
//
// Note this is the OPPOSITE of what `joinMetroWaitlistAction` does for a
// signed-in member, where reading after is right because that person is
// entitled to see themselves counted.
//
// THIS HANDLER NEVER OPENS A METRO (criterion 12), and a test asserts that no
// statement it issues writes `is_open`.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { NotFoundError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'
import { WAITLIST_ROLES, type WaitlistRole } from './waitlist-join'

/**
 * Deliberately permissive, and deliberately the same shape as the CHECK in
 * 20260922034637_metro_waitlist_anonymous.sql. Enough to catch a typo or a
 * stray word; not an attempt to adjudicate RFC 5322. Over-strict address
 * validation rejects real addresses, and the person it rejects is someone
 * trying to be counted.
 */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export const metroWaitlistJoinAnonymousInput = z.object({
  metroId: z.string().uuid(),
  // Normalised BEFORE validation, so the stored value and the index key agree
  // by construction rather than by the caller having been careful.
  email: z
    .string()
    .transform((raw) => raw.trim().toLowerCase())
    .refine((email) => EMAIL_SHAPE.test(email), {
      message: 'That does not look like an email address.',
    }),
  role: z.enum(WAITLIST_ROLES),
})

export type MetroWaitlistJoinAnonymousInput = z.infer<typeof metroWaitlistJoinAnonymousInput>

/**
 * Everything the caller learns, and nothing else.
 *
 * There is no `changed`, no `created`, no `alreadyListed`. That absence is the
 * feature — criterion 14 is enforced by the type having nowhere to leak, not
 * by callers remembering not to look.
 *
 * The counts are as they stood BEFORE this call.
 */
export interface MetroWaitlistJoinAnonymousResult {
  /** True when the metro is already live — there is nothing to wait for. */
  open: boolean
  metroId: string
  metroName: string
  creatorCount: number
  patronCount: number
  creatorThreshold: number
  patronThreshold: number
}

/** `creator` → `creator_count`. Kept here so the column names stay in one place. */
const COUNT_COLUMN: Record<WaitlistRole, string> = {
  creator: 'creator_count',
  patron: 'patron_count',
}

interface MetroRow {
  id: string
  name: string
  is_open: boolean
  creator_count: number
  patron_count: number
  creator_threshold: number
  patron_threshold: number
}

export const metroWaitlistJoinAnonymous = defineHandler(
  'metro.waitlist_join_anonymous',
  metroWaitlistJoinAnonymousInput,
  async (
    ctx: ActionContext,
    input: MetroWaitlistJoinAnonymousInput,
  ): Promise<MetroWaitlistJoinAnonymousResult> => {
    // No identity check, deliberately. `ctx.actingMemberId` is never read here
    // — criterion 13 is "no account", and a signed-out stranger is the common
    // case on the surface this serves.
    return withTransaction(async (client) => {
      // FIRST, and before any write. See criterion 14 above.
      const metroRes = await client.query<MetroRow>(
        `select id, name, is_open, creator_count, patron_count,
                creator_threshold, patron_threshold
           from public.metro_polygons
          where id = $1`,
        [input.metroId],
      )
      const metro = metroRes.rows[0]
      if (!metro) {
        throw new NotFoundError(
          `metro.waitlist_join_anonymous: metro ${input.metroId} not found`,
        )
      }

      const standing: MetroWaitlistJoinAnonymousResult = {
        open: metro.is_open,
        metroId: metro.id,
        metroName: metro.name,
        creatorCount: metro.creator_count,
        patronCount: metro.patron_count,
        creatorThreshold: metro.creator_threshold,
        patronThreshold: metro.patron_threshold,
      }

      // An open metro has no waitlist. Joining one would write a row counting
      // toward a threshold already passed.
      if (metro.is_open) return standing

      // The address's existing row, if any — across ALL metros, because the
      // index is global. Locked so a concurrent submission of the same address
      // cannot slip between this read and the write.
      const existingRes = await client.query<{ metro_id: string; role: WaitlistRole }>(
        `select metro_id, role
           from public.metro_waitlist
          where lower(email) = $1
            for update`,
        [input.email],
      )
      const existing = existingRes.rows[0] ?? null

      // Already exactly here, in exactly this role. Nothing to write and
      // nothing to increment — a resubmission, a second device, or someone
      // probing an address all land here, and all get `standing` back
      // unchanged, which is the whole of criterion 14.
      if (existing && existing.metro_id === input.metroId && existing.role === input.role) {
        return standing
      }

      const bump = async (metroId: string, role: WaitlistRole, delta: 1 | -1) => {
        const column = COUNT_COLUMN[role]
        // `greatest(..., 0)` on the way down so a counter can never go negative
        // and trip its CHECK.
        // sql-injection-safe: `column` is indexed out of a literal map by a
        // Zod-validated enum, never from caller input.
        await client.query(
          delta === 1
            ? `update public.metro_polygons set ${column} = ${column} + 1, updated_at = $2 where id = $1`
            : `update public.metro_polygons set ${column} = greatest(${column} - 1, 0), updated_at = $2 where id = $1`,
          [metroId, ctx.now()],
        )
      }

      if (existing) {
        // A move: one row updated, the old count down, the new count up, all in
        // this transaction. Criterion 5 — neither stranded nor double-counted.
        await client.query(
          `update public.metro_waitlist
              set metro_id = $2, role = $3, updated_at = $4
            where lower(email) = $1`,
          [input.email, input.metroId, input.role, ctx.now()],
        )
        await bump(existing.metro_id, existing.role, -1)
        await bump(input.metroId, input.role, 1)
      } else {
        await client.query(
          `insert into public.metro_waitlist (metro_id, email, role, created_at, updated_at)
           values ($1, $2, $3, $4, $4)`,
          [input.metroId, input.email, input.role, ctx.now()],
        )
        await bump(input.metroId, input.role, 1)
      }

      // The counts read before the write, returned whatever the write did.
      return standing
    })
  },
)

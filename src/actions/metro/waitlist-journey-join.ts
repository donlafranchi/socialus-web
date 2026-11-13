// #1299 — metro.waitlist_journey_join: the end of the one-question-per-screen waitlist journey (F076.3, F076.18).
//
// The zip decides the market (F076.2); while the PM keeps SocialUs closed every market waits, an open one included
// (F076.17), so unlike metro.waitlist_join_anonymous this never returns early for an open market. Nothing is created
// on a member and nothing is checked with a carrier (F076.13, F076.18). One row per email, across every market: a
// re-join is an update, a new zip or side moves the count (F076.4, F076.5). The result carries no count and no
// "already listed", so it reads the same whether or not the person was already waiting (F076.14). Never opens a
// market (F076.12).

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { ValidationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'
import type { WaitlistRole } from './waitlist-join'

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export const metroWaitlistJourneyJoinInput = z.object({
  zip: z.string().regex(/^\d{5}$/),
  email: z
    .string()
    .transform((raw) => raw.trim().toLowerCase())
    .refine((e) => EMAIL_SHAPE.test(e), { message: 'That does not look like an email address.' }),
  side: z.enum(['creator', 'patron']),
  name: z.string().trim().min(1).max(60),
  phone: z.string().regex(/^\+1[2-9]\d{2}[2-9]\d{6}$/),
  plans: z.array(z.string().max(40)).min(1).max(7),
  offers: z.array(z.string().max(40)).max(7),
  offerName: z.string().trim().max(120),
  offerLink: z.string().trim().max(300),
})

export type MetroWaitlistJourneyJoinInput = z.infer<typeof metroWaitlistJourneyJoinInput>

export interface MetroWaitlistJourneyJoinResult {
  metroId: string
  marketName: string
}

const COUNT_COLUMN: Record<WaitlistRole, string> = { creator: 'creator_count', patron: 'patron_count' }

export const metroWaitlistJourneyJoin = defineHandler(
  'metro.waitlist_journey_join',
  metroWaitlistJourneyJoinInput,
  async (ctx: ActionContext, input: MetroWaitlistJourneyJoinInput): Promise<MetroWaitlistJourneyJoinResult> => {
    return withTransaction(async (client) => {
      const marketRes = await client.query<{ metro_id: string | null; name: string | null }>(
        `select public.market_metro(k.key) as metro_id, public.market_name(k.key) as name
           from (select public.zip_market_key($1) as key) k where k.key is not null`,
        [input.zip],
      )
      const market = marketRes.rows[0]
      if (!market?.metro_id || !market.name) throw new ValidationError('We don’t recognize that zip.')
      const result = { metroId: market.metro_id, marketName: market.name }

      const existingRes = await client.query<{ id: string; metro_id: string; role: WaitlistRole }>(
        `select w.id, w.metro_id, w.role
           from public.metro_waitlist w
           left join auth.users u on u.id = w.member_id
          where lower(w.email) = $1 or lower(u.email) = $1
            for update of w`,
        [input.email],
      )
      const existing = existingRes.rows[0] ?? null
      const answers = [input.name, input.phone, input.zip, input.plans, input.offers, input.offerName || null, input.offerLink || null]
      if (existing && existing.metro_id === result.metroId && existing.role === input.side) {
        // Same place, same side: the answers refresh, the counts do not move.
        await client.query(
          `update public.metro_waitlist set name = $2, phone = $3, zip = $4, plans = $5, offers = $6, offer_name = $7, offer_link = $8, updated_at = $9 where id = $1`,
          [existing.id, ...answers, ctx.now()],
        )
        return result
      }

      // sql-injection-safe: the column comes from a literal map keyed by a Zod enum.
      const bump = (metroId: string, role: WaitlistRole, delta: 1 | -1) => {
        const c = COUNT_COLUMN[role]
        return client.query(
          delta === 1
            ? `update public.metro_polygons set ${c} = ${c} + 1, updated_at = $2 where id = $1`
            : `update public.metro_polygons set ${c} = greatest(${c} - 1, 0), updated_at = $2 where id = $1`,
          [metroId, ctx.now()],
        )
      }

      if (existing) {
        await client.query(
          `update public.metro_waitlist
              set metro_id = $2, role = $3, name = $4, phone = $5, zip = $6, plans = $7, offers = $8, offer_name = $9, offer_link = $10, updated_at = $11
            where id = $1`,
          [existing.id, result.metroId, input.side, ...answers, ctx.now()],
        )
        await bump(existing.metro_id, existing.role, -1)
      } else {
        // A second first-time submission of the same address racing this one inserts nothing and counts nothing.
        const ins = await client.query(
          `insert into public.metro_waitlist (metro_id, email, role, name, phone, zip, plans, offers, offer_name, offer_link, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
           on conflict ((lower(email))) where email is not null do nothing`,
          [result.metroId, input.email, input.side, ...answers, ctx.now()],
        )
        if (!ins.rowCount) return result
      }
      await bump(result.metroId, input.side, 1)
      return result
    })
  },
)

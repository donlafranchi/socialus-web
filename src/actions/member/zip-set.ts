// #695 / #568 (F081.4, F103.5) — member.zip.set
//
// A member who moves changes their zip on /you, and their market and home town follow it (zip → county → market;
// the home town is the Census Place, in an open market). The market, the town and the home metro are resolved here
// from the zip, never taken from the caller. An unknown zip is refused and nothing is written.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'

export const UNKNOWN_ZIP = "We don't recognize that zip, try again."

export const memberZipSetInput = z.object({ zip: z.string().regex(/^[0-9]{5}$/) })
export type MemberZipSetInput = z.infer<typeof memberZipSetInput>

export interface MemberZipSetResult {
  marketKey: string
  marketName: string
  open: boolean
  homeTown: string | null
}

export const memberZipSet = defineHandler(
  'member.zip.set',
  memberZipSetInput,
  async (ctx: ActionContext, input: MemberZipSetInput): Promise<MemberZipSetResult> => {
    const memberId = ctx.actingMemberId
    if (!memberId || memberId === 'self-bootstrap') throw new AuthorizationError('member.zip.set: a signed-in member is required')

    return withTransaction(async (client) => {
      const found = await client.query<{
        market_key: string
        town_geoid: string | null
        town_name: string | null
        market_name: string
        is_open: boolean | null
        metro_id: string | null
      }>(
        `select h.market_key, h.town_geoid, h.town_name, public.market_name(h.market_key) as market_name, m.is_open, m.metro_id
           from public.zip_home($1) h
           left join public.markets m on m.slug = h.market_key`,
        [input.zip],
      )
      const h = found.rows[0]
      if (!h) throw new ValidationError(UNKNOWN_ZIP)
      const open = h.is_open === true

      const res = await client.query(
        `update public.members
            set zip = $1, home_market_key = $2, home_town = $3, home_town_geoid = $4, home_metro_id = $5
          where id = $6 and deleted_at is null`,
        [input.zip, h.market_key, h.town_name, h.town_geoid, open ? h.metro_id : null, memberId],
      )
      if (res.rowCount === 0) throw new NotFoundError('member.zip.set: no such member')
      return { marketKey: h.market_key, marketName: h.market_name, open, homeTown: h.town_name }
    })
  },
)

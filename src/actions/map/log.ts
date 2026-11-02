// plan #258 — map.log
//
// One "Show on map" or Directions tap, counted into that day (Pacific). No member id is written. A member who
// turned logging off on You (search_sharing) and every builder are never counted. A tap counts once per member
// per kind per place a day, and at most 12 of a kind per member a day, by sha256 keys in map_tap_seen. Keys are
// deleted after 8 days, here, on every write.

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'

export const MAP_TAP_KINDS = ['show_on_map', 'directions'] as const
export const mapLogInput = z.object({
  kind: z.enum(MAP_TAP_KINDS),
  /** The link the tap opened, else the page it happened on; only ever hashed. */
  target: z.string().max(600).optional(),
})
export type MapLogInput = z.infer<typeof mapLogInput>

const key = (...parts: string[]) => createHash('sha256').update(parts.join('\u0000')).digest('hex')
const DAILY_CAP = 12

export const mapLog = defineHandler(
  'map.log',
  mapLogInput,
  async (ctx: ActionContext, input: MapLogInput): Promise<{ logged: boolean }> => {
    const memberId = ctx.actingMemberId
    return withTransaction(async (client) => {
      const who = await client.query<{ sharing: boolean; builder: boolean; day: string }>(
        `select coalesce((select search_sharing from public.members where id = $1), false) as sharing,
                public.is_builder($1) as builder,
                (now() at time zone 'America/Los_Angeles')::date::text as day`,
        [memberId],
      )
      const w = who.rows[0]!
      if (!w.sharing || w.builder) return { logged: false }

      await client.query(`delete from public.map_tap_seen where seen_on < current_date - 8`)
      const bucket = key(input.kind, memberId, w.day)
      const fresh = await client.query(
        `insert into public.map_tap_seen (key, bucket) values ($1, $2) on conflict (key) do nothing returning key`,
        [key(input.kind, memberId, w.day, input.target ?? ''), bucket],
      )
      if (fresh.rows.length === 0) return { logged: false }
      const n = await client.query<{ n: number }>(`select count(*)::int as n from public.map_tap_seen where bucket = $1`, [bucket])
      if (n.rows[0]!.n > DAILY_CAP) return { logged: false }
      await client.query(
        `insert into public.map_tap_daily (day, kind, taps) values ($1::date, $2, 1)
         on conflict (day, kind) do update set taps = map_tap_daily.taps + 1`,
        [w.day, input.kind],
      )
      return { logged: true }
    })
  },
)

// F121 — shelf.log
//
// One shelf event, counted into that shelf's week (Monday, Pacific): an impression (the shelf at least half on
// screen for a second), a tap (a card opened from it) or a save (a like, add to calendar or follow that came from
// it). No member id is written. A member who turned logging off on You (search_sharing) and every builder are
// never counted. An impression counts once per member per shelf per day, and a member once per shelf per week, by
// sha256 keys in shelf_seen that are deleted after 30 days, here, on every write.

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'

export const SHELF_EVENTS = ['impression', 'tap', 'save'] as const
export const shelfLogInput = z.object({
  shelfId: z.string().regex(/^[a-z0-9-]{2,60}$/),
  event: z.enum(SHELF_EVENTS),
})
export type ShelfLogInput = z.infer<typeof shelfLogInput>

const key = (...parts: string[]) => createHash('sha256').update(parts.join('\u0000')).digest('hex')
const COLUMN = { impression: 'impressions', tap: 'taps', save: 'saves' } as const

export const shelfLog = defineHandler(
  'shelf.log',
  shelfLogInput,
  async (ctx: ActionContext, input: ShelfLogInput): Promise<{ logged: boolean }> => {
    const memberId = ctx.actingMemberId
    return withTransaction(async (client) => {
      const who = await client.query<{ sharing: boolean; builder: boolean; shelf: boolean; day: string; week: string }>(
        `select coalesce((select search_sharing from public.members where id = $1), false) as sharing,
                public.is_builder($1) as builder,
                exists (select 1 from public.shelves where id = $2) as shelf,
                (now() at time zone 'America/Los_Angeles')::date::text as day,
                (date_trunc('week', now() at time zone 'America/Los_Angeles'))::date::text as week`,
        [memberId, input.shelfId],
      )
      const w = who.rows[0]!
      if (!w.sharing || w.builder || !w.shelf) return { logged: false }

      await client.query(`delete from public.shelf_seen where seen_on < current_date - 30`)
      const fresh = async (k: string) =>
        (await client.query(`insert into public.shelf_seen (key, shelf_id) values ($1, $2) on conflict (key) do nothing returning key`, [k, input.shelfId])).rows.length > 0

      let add = { impressions: 0, members: 0, taps: 0, saves: 0 }
      if (input.event === 'impression') {
        if (!(await fresh(key('day', memberId, input.shelfId, w.day)))) return { logged: false }
        add = { ...add, impressions: 1, members: (await fresh(key('week', memberId, input.shelfId, w.week))) ? 1 : 0 }
      } else {
        add = { ...add, [COLUMN[input.event]]: 1 }
      }
      await client.query(
        `insert into public.shelf_weekly (shelf_id, week_start, impressions, members, taps, saves)
         values ($1, $2::date, $3, $4, $5, $6)
         on conflict (shelf_id, week_start) do update set
           impressions = shelf_weekly.impressions + excluded.impressions,
           members = shelf_weekly.members + excluded.members,
           taps = shelf_weekly.taps + excluded.taps,
           saves = shelf_weekly.saves + excluded.saves`,
        [input.shelfId, w.week, add.impressions, add.members, add.taps, add.saves],
      )
      return { logged: true }
    })
  },
)

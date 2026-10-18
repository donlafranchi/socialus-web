// #909 — search.demand_log
//
// A settled Explore search, counted for the members' benefit (F113 option C, 2026-10-16): the normalized text,
// the area it ran in and how many results came back. No member id is written with it. A member who turned it off
// on You is never logged. Signed out logs too; it is anonymous either way.
//
// Noise: one log per searcher per query per 10 minutes, keyed on a sha256 of (searcher, query) in
// search_demand_seen. The table holds only keys younger than 10 minutes (pruned here, on every write), so it works
// across server instances, which an in-memory map would not, and never links a search to a person past the window.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'
import { demandKey, normalizeSearchQuery } from '@/lib/search/demand'

export const searchDemandLogInput = z.object({
  query: z.string().max(500),
  metroSlug: z.string().max(80).nullable(),
  placeId: z.string().uuid().nullable(),
  resultCount: z.number().int().min(0).max(100000),
  /** Who is searching, for the dedupe only: the member id, else a per-browser value. Hashed, never stored. */
  searcher: z.string().min(1).max(200),
})
export type SearchDemandLogInput = z.infer<typeof searchDemandLogInput>

function memberOf(ctx: ActionContext): string | null {
  try {
    const id = ctx.actingMemberId
    return id && id !== 'self-bootstrap' ? id : null
  } catch {
    return null
  }
}

export const searchDemandLog = defineHandler(
  'search.demand_log',
  searchDemandLogInput,
  async (ctx: ActionContext, input: SearchDemandLogInput): Promise<{ logged: boolean }> => {
    const q = normalizeSearchQuery(input.query)
    if (!q) return { logged: false }
    const memberId = memberOf(ctx)

    return withTransaction(async (client) => {
      if (memberId) {
        const me = await client.query<{ search_sharing: boolean }>(`select search_sharing from public.members where id = $1`, [memberId])
        if (me.rows[0]?.search_sharing === false) return { logged: false }
      }
      await client.query(`delete from public.search_demand_seen where seen_at < now() - interval '10 minutes'`)
      const seen = await client.query(
        `insert into public.search_demand_seen (key) values ($1) on conflict (key) do nothing returning key`,
        [demandKey(memberId ?? input.searcher, q)],
      )
      if (seen.rows.length === 0) return { logged: false }
      await client.query(
        `insert into public.search_demand (query, metro_id, place_id, result_count)
         values ($1, (select id from public.metro_polygons where slug = $2), (select id from public.places where id = $3), $4)`,
        [q, input.metroSlug, input.placeId, input.resultCount],
      )
      return { logged: true }
    })
  },
)

// #1090 — /open/<market>: where a market stands on opening (Don, 2026-10-26).
// Counted per market, never per town: a town belongs to a market through
// `market_members`, so this file knows no boundary. Aggregate counts only, from
// the cached snapshot every waitlist surface reads; never a name or an address.

import { createAnonClient } from '@/lib/supabase-anon'
import { waitingByRoleFor } from './waitlist-counts'

// The column defaults (20261026180000_open_market_goals.sql), for a market no one has joined yet.
const DEFAULT_GOAL = { makers: 100, supporters: 1000 }

export interface OpenMarket {
  key: string
  name: string
  open: boolean
  makers: { count: number; goal: number }
  supporters: { count: number; goal: number }
}

export async function openMarketFor(key: string): Promise<OpenMarket | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(key)) return null
  const supabase = createAnonClient()

  const named = await supabase.rpc('market_name', { p_key: key })
  const name = named.data as string | null
  if (named.error || !name) return null

  const { data: market } = await supabase.from('markets').select('is_open, metro_id').eq('slug', key).maybeSingle()
  const m = market as { is_open: boolean; metro_id: string | null } | null

  // Read, never created: a public page must not write the row a join would.
  const metroQuery = supabase.from('metro_polygons').select('id, creator_threshold, patron_threshold')
  const { data: metro } = await (m?.metro_id ? metroQuery.eq('id', m.metro_id) : metroQuery.eq('slug', key)).maybeSingle()
  const row = metro as { id: string; creator_threshold: number; patron_threshold: number } | null

  const counts = row ? await waitingByRoleFor(row.id) : null
  return {
    key,
    name,
    open: Boolean(m?.is_open),
    makers: { count: counts?.makers ?? 0, goal: row?.creator_threshold ?? DEFAULT_GOAL.makers },
    supporters: { count: counts?.supporters ?? 0, goal: row?.patron_threshold ?? DEFAULT_GOAL.supporters },
  }
}

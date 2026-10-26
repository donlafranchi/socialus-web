// #694 (F103.2, F103.3) — the zip is looked up once to one market (zip → county → market),
// and only the market decides what comes next: in if it is open, its waitlist if not. Nothing else
// decides it: not IP, not a default, not a nearest match; an unknown zip has no market.
//
// The metro row is the bridge: the feed and the waitlist still read metro_polygons through beta,
// so an open market hands back the row it was seeded from, and a waiting one gets a row to wait on.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ZipMarket {
  /** 'sacramento', 'tahoe', or 'county-<fips>'. */
  key: string
  /** In plain words: "Sacramento", "Yuba County, CA". */
  name: string
  open: boolean
  /** The metro_polygons row behind the market (feed home, or what the waitlist counts against). */
  metroId: string
}

export async function marketForZip(supabase: Pick<SupabaseClient, 'from' | 'rpc'>, zip: string): Promise<ZipMarket | null> {
  const keyed = await supabase.rpc('zip_market_key', { p_zip: zip })
  const key = keyed.data as string | null
  if (keyed.error || !key) return null

  const named = await supabase.rpc('market_name', { p_key: key })
  const name = named.data as string | null
  if (named.error || !name) return null

  const { data: row, error } = await supabase.from('markets').select('is_open, metro_id').eq('slug', key).maybeSingle()
  if (error) return null
  const market = row as { is_open: boolean; metro_id: string | null } | null

  if (market?.is_open && market.metro_id) return { key, name, open: true, metroId: market.metro_id }

  const waiting = await supabase.rpc('market_metro', { p_key: key })
  const metroId = waiting.data as string | null
  if (waiting.error || !metroId) return null
  return { key, name, open: false, metroId }
}

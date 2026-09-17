// T155 (#52) — the feed's vantage point becomes a metro.
//
// Why this is a second resolver rather than a parameter on the place one:
// `locality_feed_items` intersects `places.geography`, and `places.kind` is
// constrained to region / state / county / city / neighborhood (migration 017)
// — there is no metro value in that enum. Metro is a separate overlay table
// with its own polygon (migration 031). Metro-grain resolution reads a
// different table; it is not a configured call of the first.
//
// Model-independent, and checked rather than assumed: `metro_polygons`
// references no Item table and no `discoverable_items`. It is geography plus
// `members.home_metro_id`. Nothing here survives or falls with Items.

import type { SupabaseClient } from '@supabase/supabase-js'

/** The seeded Sacramento CSA — migration 031's one seeded row. */
export const DEFAULT_METRO_SLUG = 'sacramento-roseville-ca'

export interface FeedMetro {
  id: string
  slug: string
  name: string
}

type FromClient = Pick<SupabaseClient, 'from'>

const TABLE = 'metro_polygons'
const COLUMNS = 'id, slug, name'

async function one(
  supabase: FromClient,
  column: 'id' | 'slug',
  value: string,
): Promise<FeedMetro | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq(column, value)
    .maybeSingle()
  if (error) throw error
  return (data as FeedMetro | null) ?? null
}

/**
 * Resolve the metro a feed is read from.
 *
 * Precedence: **requestedSlug → memberMetroId → default metro.**
 *
 * Same precedence as `resolveFeedPlace`: requested → stored → default. That
 * used to be an inversion worth calling out — the Place resolver read the
 * stored value first, which is why the shipped scope picker did nothing. Fixed
 * 2026-09-17; the two now agree, and an explicit act by a person beats a stored
 * default in both.
 */
export async function resolveFeedMetro(
  supabase: FromClient,
  opts: { memberMetroId?: string | null; requestedSlug?: string | null },
): Promise<FeedMetro | null> {
  if (opts.requestedSlug) {
    const m = await one(supabase, 'slug', opts.requestedSlug)
    if (m) return m
  }
  if (opts.memberMetroId) {
    const m = await one(supabase, 'id', opts.memberMetroId)
    if (m) return m
  }
  return one(supabase, 'slug', DEFAULT_METRO_SLUG)
}

/**
 * The metros the switcher offers, by name.
 *
 * There is exactly one seeded today. The rural hole is real and this does not
 * close it: `members.home_metro_id` is null outside every seeded CSA, and the
 * default keeps the surface non-blank without making it relevant to someone in
 * another state. A known limitation of a one-metro launch.
 */
export async function listFeedMetros(supabase: FromClient): Promise<FeedMetro[]> {
  const { data, error } = await supabase.from(TABLE).select(COLUMNS).order('name')
  if (error) throw error
  return (data ?? []) as FeedMetro[]
}

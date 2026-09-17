// T088 — Feed Place resolution (F030).
//
// Precedence: an explicit scope-picker slug → an authenticated Member's
// primary_home → the launch-locality default.
//
// CORRECTED 2026-09-17. It used to read the stored place FIRST, so a member with
// a primary_home could tap the scope picker and nothing would happen — the
// resolver returned the stored value and discarded the request. `feed-metro.ts`
// named this in a comment ("the reason the shipped scope picker does nothing")
// and it is Don's "I have the good place, can't change it".
//
// The rule, stated once: **an explicit act by a person beats a stored default.**
//
// b1 IP geolocation is DEFERRED — the launch default stands in for the
// IP-geolocated locality, which is why `source` exists: a caller has to be able
// to tell "this is where you said you are" from "this is a stand-in", and say
// so rather than asserting a locality nobody chose. Returns null only when even
// the default row is missing.

import type { SupabaseClient } from '@supabase/supabase-js'

/** b1 launch locality. Stands in for IP geolocation until that lands. */
export const LAUNCH_PLACE_SLUG = 'the-good-place'

export interface FeedPlace {
  placeId: string
  displayName: string
  slug: string
  /**
   * How this place was chosen.
   *
   * `requested` — the person asked for it. `member` — their stored home.
   * `default` — nobody chose it and the launch locality is standing in. A
   * surface must not present `default` as the member's place.
   */
  source: FeedPlaceSource
}

export type FeedPlaceSource = 'requested' | 'member' | 'default'

type FromClient = Pick<SupabaseClient, 'from'>

async function byId(supabase: FromClient, id: string): Promise<FeedPlace | null> {
  const { data, error } = await supabase
    .from('places')
    .select('id, display_name, slug')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const p = data as { id: string; display_name: string; slug: string }
  return { placeId: p.id, displayName: p.display_name, slug: p.slug, source: 'member' }
}

async function bySlug(supabase: FromClient, slug: string): Promise<FeedPlace | null> {
  // A neighborhood/city slug can collide with a county slug (e.g. 'sacramento');
  // prefer the most specific (neighborhood > city > county) via kind ordering.
  const { data, error } = await supabase
    .from('places')
    .select('id, display_name, slug, kind')
    .eq('slug', slug)
    .is('deleted_at', null)
  if (error) throw error
  const rows = (data ?? []) as { id: string; display_name: string; slug: string; kind: string }[]
  if (rows.length === 0) return null
  const rank: Record<string, number> = { neighborhood: 0, city: 1, county: 2, state: 3, region: 4 }
  rows.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9))
  const p = rows[0]
  return { placeId: p.id, displayName: p.display_name, slug: p.slug, source: 'requested' }
}

export async function resolveFeedPlace(
  supabase: FromClient,
  opts: { memberPlaceId?: string | null; requestedSlug?: string | null },
): Promise<FeedPlace | null> {
  // Requested first. This order is the fix.
  if (opts.requestedSlug) {
    const p = await bySlug(supabase, opts.requestedSlug)
    if (p) return p
  }
  if (opts.memberPlaceId) {
    const p = await byId(supabase, opts.memberPlaceId)
    if (p) return p
  }
  // Nobody chose this. `source: 'default'` is how a surface knows not to
  // present it as the member's own place.
  const fallback = await bySlug(supabase, LAUNCH_PLACE_SLUG)
  return fallback ? { ...fallback, source: 'default' } : null
}

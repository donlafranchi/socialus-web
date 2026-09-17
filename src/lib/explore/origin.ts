// T115 — the point Explore's distance filter measures from (F045).
//
// The radius is measured from the centre of the locality the member is
// browsing, not from the device: it needs no permission prompt, it matches the
// place named in the search row's location pill, and it is the same locality
// the Home feed uses. Browser geolocation would add a privacy-touching
// affordance that F045 does not ask for.
//
// Explore now HAS a scope of its own: the metro chosen in the scope sheet,
// carried in `?metro=`. A chosen metro wins outright — it is an explicit act by
// a person, and `metro_polygons` carries both the name to show and the centroid
// to measure from. With no metro chosen this falls back to the same
// launch-locality default the feed uses.
//
// Only an OPEN metro can be chosen (the sheet does not offer the others), which
// is also the only kind that has a centroid: the waitlist migration dropped the
// NOT NULL on `geography` and `centroid`, and 295 of 296 rows are now null on
// both. A null centroid yields a null point, and the distance filter already
// treats that as "no honest way to measure a radius".
//
// `chosen` carries whether anyone actually picked the place. It is false for
// the launch default, and the pill says so in plain words rather than naming a
// locality nobody chose.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveFeedPlace, LAUNCH_PLACE_SLUG } from '@/lib/feed/feed-place'
import { decodeEwkbPoint } from './ewkb'
import type { GeoPoint } from './filters'

type FromClient = Pick<SupabaseClient, 'from'>

export interface ExploreOrigin {
  placeName: string
  /**
   * Did anyone actually choose this place?
   *
   * `false` when the launch locality is standing in for the IP geolocation
   * deferred at b1 — nobody said they were here. A surface must not present
   * that as the member's place, which is what naming it did.
   */
  chosen: boolean
  /** Null when the place row carries no polygon-derived centroid. */
  point: GeoPoint | null
}

export async function fetchExploreOrigin(
  client: FromClient,
  opts: { metroSlug?: string | null } = {},
): Promise<ExploreOrigin | null> {
  try {
    if (opts.metroSlug) {
      const metro = await fetchMetroOrigin(client, opts.metroSlug)
      // A slug that resolves to nothing falls through to the place default
      // rather than blanking the pill — a stale link should not break Browse.
      if (metro) return metro
    }
    const place = await resolveFeedPlace(client, {})
    if (!place) return null
    const { data } = await client
      .from('places')
      .select('centroid')
      .eq('id', place.placeId)
      .maybeSingle()
    const centroid = (data as { centroid: string | null } | null)?.centroid ?? null
    return {
      placeName: place.displayName,
      // Not just `source !== 'default'`. Onboarding writes The Good Place into
      // every new Member's primary_home invisibly — "the locality write is
      // invisible to the Member — there is no picker" (onboarding/actions.ts).
      // So a stored value pointing at the launch place is still nobody's
      // choice, and naming it would be the same lie by a longer route.
      chosen: place.source !== 'default' && place.slug !== LAUNCH_PLACE_SLUG,
      point: decodeEwkbPoint(centroid),
    }
  } catch {
    return null
  }
}

/** The chosen metro as an origin: its own name, its own centroid. */
async function fetchMetroOrigin(client: FromClient, slug: string): Promise<ExploreOrigin | null> {
  const { data } = await client
    .from('metro_polygons')
    .select('name, centroid, is_open')
    .eq('slug', slug)
    .maybeSingle()
  const row = data as { name: string; centroid: string | null; is_open: boolean } | null
  // Refuse a metro the platform does not serve even if the URL names one. The
  // sheet cannot offer these; a hand-typed `?metro=` must not get further.
  if (!row || !row.is_open) return null
  return { placeName: row.name, chosen: true, point: decodeEwkbPoint(row.centroid) }
}

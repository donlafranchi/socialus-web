// T115 — the point Explore's distance filter measures from (F045).
//
// The radius is measured from the centre of the locality the member is
// browsing, not from the device: it needs no permission prompt, it matches the
// place named in the search row's location pill, and it is the same locality
// the Home feed uses. Browser geolocation would add a privacy-touching
// affordance that F045 does not ask for.
//
// Explore has no place scope of its own at b1, so this resolves the same
// launch-locality default the feed falls back to. See DEVIATIONS — member
// primary_home precedence lands with an Explore place scope.
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

export async function fetchExploreOrigin(client: FromClient): Promise<ExploreOrigin | null> {
  try {
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

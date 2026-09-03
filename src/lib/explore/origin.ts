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

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveFeedPlace } from '@/lib/feed/feed-place'
import { decodeEwkbPoint } from './ewkb'
import type { GeoPoint } from './filters'

type FromClient = Pick<SupabaseClient, 'from'>

export interface ExploreOrigin {
  placeName: string
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
    return { placeName: place.displayName, point: decodeEwkbPoint(centroid) }
  } catch {
    return null
  }
}

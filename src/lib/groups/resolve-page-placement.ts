// T143 — Where a Page appears is resolved, not stored.
// Spec:   product/systems/groups.md § Where a Page appears is resolved,
//         not stored (review-F061.md binding notes 9 and 10).
// Ticket: development/tickets/done/T143-position-resolver.md
//
// One read-time function. No column, cache, or materialized view stores a
// Page's resolved position — an appearance starting or ending changes the
// answer with no write to the Page, so anything precomputed goes stale
// with nothing to invalidate it.

import type { PoolClient } from 'pg'
import { withTransaction } from '@/actions/_lib/db'

export type PlacementKind = 'point' | 'area'
export type PlacementSource = 'anchor' | 'appearance'

export interface Placement {
  source: PlacementSource
  kind: PlacementKind
  /** Human-readable — a street address (point) or a Place name (area).
   *  Never a bare coordinate; coordinates are carried separately for
   *  whatever renders the placement (F062's territory, not this ticket's). */
  label: string
  lng: number
  lat: number
}

// Active appearances at Venues win over the Page's own anchor, and an
// appearance replaces an area anchor but adds to an address anchor
// (groups.md § Where a Page appears is resolved — "an appearance
// replaces an area; it adds to an address"). Unreachable today: there is
// no `appearances` table (not yet scenarioed). Left in place, not deleted
// or commented out, so the appearances ticket extends this function
// rather than rewriting its structure. See T143 notes for the forward
// design: appearance rows must carry a real time-range column so a
// btree_gist exclusion constraint can refuse an overlap at creation.
async function resolveAppearancePlacements(
  _client: PoolClient,
  _groupId: string,
): Promise<Placement[]> {
  void _client
  void _groupId
  return []
}

async function resolveAnchorPlacement(
  client: PoolClient,
  groupId: string,
): Promise<Placement | null> {
  const groupRes = await client.query<{ anchor_location_id: string | null }>(
    `select anchor_location_id from public.groups where id = $1`,
    [groupId],
  )
  const anchorLocationId = groupRes.rows[0]?.anchor_location_id
  if (!anchorLocationId) return null

  const locRes = await client.query<{
    kind: string
    description: string | null
    lng: number | null
    lat: number | null
  }>(
    `select kind, description,
            st_x(geography::geometry) as lng,
            st_y(geography::geometry) as lat
       from public.locations
      where id = $1`,
    [anchorLocationId],
  )
  const loc = locRes.rows[0]
  if (!loc || loc.lng == null || loc.lat == null) return null

  if (loc.kind === 'area') {
    const placeRes = await client.query<{ place_id: string }>(
      `select place_id from public.place_for_coords($1, $2)`,
      [loc.lat, loc.lng],
    )
    const placeId = placeRes.rows[0]?.place_id
    let label = 'a nearby neighbourhood'
    if (placeId) {
      const nameRes = await client.query<{ display_name: string }>(
        `select display_name from public.places where id = $1`,
        [placeId],
      )
      label = nameRes.rows[0]?.display_name ?? label
    }
    return { source: 'anchor', kind: 'area', label, lng: loc.lng, lat: loc.lat }
  }

  return {
    source: 'anchor',
    kind: 'point',
    // The resolved address T142 persists on creation. A Location without
    // one (pre-T142 row, or a future caller that skips it) falls back to
    // a generic label rather than rendering nothing.
    label: loc.description?.trim() || 'a location',
    lng: loc.lng,
    lat: loc.lat,
  }
}

/** Resolves where a Page currently appears — a list of placements, never
 *  a single point. At launch, before appearances exist, this returns
 *  exactly one placement: the Page's own anchor. */
export async function resolvePagePlacements(groupId: string): Promise<Placement[]> {
  return withTransaction(async (client) => {
    const appearances = await resolveAppearancePlacements(client, groupId)
    if (appearances.length > 0) {
      // Precedence branch, unreachable today (see above): an appearance
      // at a Venue wins over the anchor, and for an address anchor it
      // adds to rather than replaces it. Nothing populates this path yet.
      return appearances
    }

    const anchor = await resolveAnchorPlacement(client, groupId)
    return anchor ? [anchor] : []
  })
}

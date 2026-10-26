// T143 — Where a Page appears is resolved, not stored.
// Spec:   product/systems/groups.md § Where a Page appears is resolved,
//         not stored (review-F061.md binding notes 9 and 10).
// Ticket: development/tickets/done/T143-position-resolver.md
//
// One read-time function. No column, cache, or materialized view stores a
// Page's resolved position — an appearance starting or ending changes the
// answer with no write to the Page, so anything precomputed goes stale
// with nothing to invalidate it.

import { getPool } from '@/actions/_lib/db'

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
async function resolveAppearancePlacements(_groupId: string): Promise<Placement[]> {
  void _groupId
  return []
}

/**
 * #978 — one statement, no transaction. This used to be BEGIN, four dependent reads and COMMIT through
 * the pooler (up to six round trips before the Page could start to stream); it is read-only and needs
 * none of that. The Place name is looked up only for an area anchor.
 */
async function resolveAnchorPlacement(groupId: string): Promise<Placement | null> {
  const res = await getPool().query<{
    kind: string
    description: string | null
    lng: number | null
    lat: number | null
    place_name: string | null
  }>(
    `select l.kind, l.description,
            st_x(l.geography::geometry) as lng,
            st_y(l.geography::geometry) as lat,
            case when l.kind = 'area' then
              (select p.display_name from public.places p
                where p.id = (select pc.place_id from public.place_for_coords(st_y(l.geography::geometry), st_x(l.geography::geometry)) pc limit 1))
            end as place_name
       from public.groups g
       join public.locations l on l.id = g.anchor_location_id
      where g.id = $1`,
    [groupId],
  )
  const loc = res.rows[0]
  if (!loc || loc.lng == null || loc.lat == null) return null

  if (loc.kind === 'area') {
    return { source: 'anchor', kind: 'area', label: loc.place_name ?? 'a nearby neighbourhood', lng: loc.lng, lat: loc.lat }
  }

  return {
    source: 'anchor',
    kind: 'point',
    label: loc.description?.trim() || '',
    lng: loc.lng,
    lat: loc.lat,
  }
}

/** Resolves where a Page currently appears — a list of placements, never
 *  a single point. At launch, before appearances exist, this returns
 *  exactly one placement: the Page's own anchor. */
export async function resolvePagePlacements(groupId: string): Promise<Placement[]> {
  const appearances = await resolveAppearancePlacements(groupId)
  if (appearances.length > 0) {
    // Precedence branch, unreachable today (see above): an appearance
    // at a Venue wins over the anchor, and for an address anchor it
    // adds to rather than replaces it. Nothing populates this path yet.
    return appearances
  }

  const anchor = await resolveAnchorPlacement(groupId)
  return anchor ? [anchor] : []
}

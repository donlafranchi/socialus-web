'use client'

// The map, wired to Pages.
//
// It replaces `useMapBusinesses`, which queried `.from('businesses')` — a table
// that does not exist and never did (#94). The query failed silently and the
// map rendered an empty basemap, which is why nobody could tell the difference
// between "no Pages near you" and "this has never worked".
//
// Pages live in `groups`, pinned through `anchor_location_id → locations`.
// Which kinds belong on the map is `kind-controls`' call, not this module's —
// Don's ruling, 2026-09-16: the control belongs to the Page kind.
//
// Bounds are applied client-side. `locations.geography` is a PostGIS geography
// column and PostgREST cannot express a bbox filter over one without an RPC;
// the alternative is a migration, and a working map today beats a better query
// next week. The 500-row cap is what keeps that honest, and the RPC is the
// upgrade path if the cap ever bites.

import { useCallback, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { decodeEwkbPoint } from '@/lib/explore/ewkb'
import { appearsOnMap } from '@/lib/groups/kind-controls'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { visiblePhotoUrl } from '@/lib/groups/visible-photo-url'
import { MAP_DEFAULTS } from '@/lib/map-config'

export interface Bounds {
  north: number
  south: number
  east: number
  west: number
}

/** A `groups` row joined to its anchor location, as PostgREST returns it. */
export interface MapPageRow {
  id: string
  name: string | null
  slug: string | null
  /** Issue #175 — what the Page's canonical address resolves by. */
  public_id: string | null
  kind: string
  category: string | null
  photo_url: string | null
  photo_hidden_at: string | null
  photo_hide_locked_url: string | null
  anchor: { label: string | null; geography: string | null } | null
}

export interface MapPage {
  id: string
  name: string
  slug: string
  kind: string
  category: string | null
  photoUrl: string | null
  locationLabel: string | null
  longitude: number | null
  latitude: number | null
  /** Canonical Page URL, `/p/[…place]/g/[slug]`. Null when the place path
   *  cannot be resolved — a pin with no link beats no pin. */
  href: string | null
}

export function withinBounds(
  p: { longitude: number | null; latitude: number | null },
  bounds: Bounds | null,
): boolean {
  if (!bounds) return true
  if (p.longitude == null || p.latitude == null) return false
  return (
    p.latitude >= bounds.south &&
    p.latitude <= bounds.north &&
    p.longitude >= bounds.west &&
    p.longitude <= bounds.east
  )
}

export function rowsToMapPages(rows: MapPageRow[]): MapPage[] {
  const out: MapPage[] = []
  for (const r of rows) {
    if (!appearsOnMap(r.kind)) continue
    if (!r.anchor?.geography) continue

    // A bad point loses its pin, never the whole map — the same rule
    // browse-pages applies, for the same reason.
    let lngLat: { longitude: number; latitude: number } | null = null
    try {
      const p = decodeEwkbPoint(r.anchor.geography)
      if (p) lngLat = { longitude: p.longitude, latitude: p.latitude }
    } catch {
      lngLat = null
    }
    if (!lngLat) continue

    out.push({
      id: r.id,
      name: r.name ?? 'Untitled',
      slug: r.slug ?? r.id,
      kind: r.kind,
      category: r.category,
      // The hide is a projection concern every surface reading a photo must
      // apply — T160. The map is one of those surfaces.
      photoUrl: visiblePhotoUrl({
        photo_url: r.photo_url,
        photo_hidden_at: r.photo_hidden_at,
      }),
      locationLabel: r.anchor.label,
      longitude: lngLat.longitude,
      latitude: lngLat.latitude,
      // Issue #175 — the address is on the row. It used to need a second
      // round trip through `locations.place_id`, which is null for every Page
      // a member made, so every one of those pins was unclickable.
      href: r.public_id ? canonicalPagePath(r.public_id) : null,
    })
  }
  return out
}

const SELECT =
  'id, name, slug, public_id, kind, category, photo_url, photo_hidden_at, photo_hide_locked_url,' +
  ' anchor:locations!groups_anchor_location_id_fkey(label, geography)'

export function useMapPages() {
  const [pages, setPages] = useState<MapPage[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = createClient()

  const fetchPages = useCallback(async (bounds: Bounds | null, category?: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      setLoading(true)
      let query = supabase
        .from('groups')
        .select(SELECT)
        // Drafts and unlisted Pages are not public. RLS should say so too, but
        // a read path that relies only on RLS to hide a draft is one policy
        // change away from publishing one.
        .eq('lifecycle_state', 'active')
        .eq('discoverability', 'listed')
        .not('anchor_location_id', 'is', null)

      if (category) query = query.ilike('category', `%${category}%`)

      const { data, error } = await query.limit(500)

      if (error) {
        // Loud, because the failure this replaces was silent for months.
        console.error('[useMapPages] Pages query failed:', error.message)
        setPages([])
      } else {
        const mapped = rowsToMapPages((data ?? []) as unknown as MapPageRow[])
        // A category search is global on purpose, so the map can zoom to a
        // result that is off-screen. Browsing is bounded.
        setPages(category ? mapped : mapped.filter((p) => withinBounds(p, bounds)))
      }
      setLoading(false)
    }, MAP_DEFAULTS.debounceMs)
  }, [])

  return { pages, loading, fetchPages }
}

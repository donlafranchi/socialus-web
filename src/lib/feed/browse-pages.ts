// T154 (#51) — Page-grain browse read helper.
//
// Supabase-client-shaped (calls the browse_pages RPC) so it runs from a server
// component with the session-bound or anon client — same convention as
// getLocalityFeed and resolve-shop.
//
// This is Browse's read, not Home's. Browse is complete and is NOT ranked by
// the member's declared interests (ruled 2026-09-12); that is why there is no
// tag parameter here and no tag boost in the function. If Home is ever fed
// from this source, the boost arrives as a parameter — it does not get baked
// in and filtered back out.
//
// Posts are absent by necessity, not by design: browse indexes them too, flat
// (ruled 2026-09-12), but `page_posts` does not exist yet.

import type { SupabaseClient } from '@supabase/supabase-js'
import { decodeEwkbPoint } from '@/lib/explore/ewkb'
import { attachGroupPrefixes } from './group-prefixes'
import { clampLimit } from './locality-feed'

/** One row exactly as `browse_pages` returns it. */
export interface BrowsePageRow {
  group_id: string
  slug: string
  name: string
  category: string | null
  description: string | null
  photo_url: string | null
  anchor_location_id: string | null
  anchor_location_label: string | null
  anchor_location_geography: string | null
  updated_at: string
}

export interface BrowsePage {
  groupId: string
  slug: string
  name: string
  category: string | null
  description: string | null
  photoUrl: string | null
  anchorLocationId: string | null
  anchorLocationLabel: string | null
  /** Map pin. Null when the Page has no resolvable point. */
  longitude: number | null
  latitude: number | null
  updatedAt: string
  /** Attached by attachGroupPrefixes (T119); null with no resolvable Place. */
  groupSlug?: string | null
  groupPlacePath?: string | null
}

type RpcClient = Pick<SupabaseClient, 'rpc'>

/**
 * A bad point loses its pin, never the Page.
 *
 * The alternative — letting a decode failure throw — turns one malformed
 * geography into an empty browse surface, which is a worse answer to "what is
 * near me" than a result with no pin.
 */
function pointOf(ewkb: string | null): { longitude: number | null; latitude: number | null } {
  if (!ewkb) return { longitude: null, latitude: null }
  try {
    const p = decodeEwkbPoint(ewkb)
    return { longitude: p?.longitude ?? null, latitude: p?.latitude ?? null }
  } catch {
    return { longitude: null, latitude: null }
  }
}

export async function getBrowsePages(
  supabase: RpcClient,
  opts: { placeId: string; category?: string | null; limit?: number | null },
): Promise<BrowsePage[]> {
  const { data, error } = await supabase.rpc('browse_pages', {
    p_place_id: opts.placeId,
    p_category: opts.category ?? null,
    p_limit: clampLimit(opts.limit),
  })
  if (error) throw error

  const mapped = ((data ?? []) as BrowsePageRow[]).map((r) => ({
    groupId: r.group_id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    description: r.description,
    photoUrl: r.photo_url,
    anchorLocationId: r.anchor_location_id,
    anchorLocationLabel: r.anchor_location_label,
    ...pointOf(r.anchor_location_geography),
    updatedAt: r.updated_at,
  }))

  // T119's batched URL prefixes. It keys on `groupId`, which these rows carry.
  return attachGroupPrefixes(supabase as never, mapped as never) as unknown as BrowsePage[]
}

// T117 — Explore read helper over the `discoverable_items` materialized view.
//
// The MV is the public browse index (016 → 034 → 036): its WHERE clause is the
// visibility gate (published, not soft-deleted, no Group or a listed-and-
// undissolved Group), it is granted to anon + authenticated, and it is already
// denormalized across items + members + locations + groups, so a browse costs
// one round trip. Replaces the pre-rebuild `businesses` / `vendor_categories` /
// `market_vendors` reads, none of which exist in the database any more.
//
// ExploreItem extends FeedItem so `ItemFeedCard` consumes it unchanged.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeedItem } from '@/lib/feed/locality-feed'
import type { ItemKindFilter } from './kinds'
import { decodeEwkbPoint } from './ewkb'

export interface ExploreItem extends FeedItem {
  description: string | null
  startsAt: string | null
  /** Nearest approved Location, decoded from the MV's geography column. */
  longitude: number | null
  latitude: number | null
}

export const EXPLORE_SELECT =
  'item_id,member_handle,member_display_name,item_kind,title,description,category,' +
  'brand_label,group_id,nearest_location_label,nearest_location_geography,' +
  'response_count,primary_tag,photo_url,starts_at,published_at'

export const EXPLORE_LIMIT = 100

interface ExploreRow {
  item_id: string
  member_handle: string
  member_display_name: string
  item_kind: string
  title: string
  description: string | null
  category: string | null
  brand_label: string | null
  group_id: string | null
  nearest_location_label: string | null
  nearest_location_geography: string | null
  response_count: number | string | null
  primary_tag: string | null
  photo_url: string | null
  starts_at: string | null
  published_at: string
}

export function mapExploreRow(r: ExploreRow): ExploreItem {
  const point = decodeEwkbPoint(r.nearest_location_geography)
  return {
    itemId: r.item_id,
    kind: r.item_kind,
    title: r.title,
    description: r.description,
    category: r.category,
    brandLabel: r.brand_label,
    groupId: r.group_id,
    ownerHandle: r.member_handle,
    ownerDisplayName: r.member_display_name,
    nearestLocationLabel: r.nearest_location_label,
    responseCount: Number(r.response_count ?? 0),
    primaryTag: r.primary_tag,
    photoUrl: r.photo_url ?? null,
    startsAt: r.starts_at,
    publishedAt: r.published_at,
    longitude: point?.longitude ?? null,
    latitude: point?.latitude ?? null,
  }
}

type FromClient = Pick<SupabaseClient, 'from'>

/**
 * Newest-first page of the browse index. `kind` filters server-side on the
 * indexed `item_kind` column; the All pill sends no predicate. A read error
 * yields an empty page rather than throwing — Explore degrades to its empty
 * state instead of blanking the tab.
 */
export async function fetchExploreItems(
  client: FromClient,
  opts: { kind?: ItemKindFilter; limit?: number },
): Promise<ExploreItem[]> {
  let q = client.from('discoverable_items').select(EXPLORE_SELECT)
  if (opts.kind) q = q.eq('item_kind', opts.kind)
  const { data, error } = await q
    .order('published_at', { ascending: false })
    .limit(opts.limit ?? EXPLORE_LIMIT)
  if (error) return []
  return ((data ?? []) as unknown as ExploreRow[]).map(mapExploreRow)
}

/** Free-text + category refinement over an already-fetched page. */
export function searchExploreItems(
  items: readonly ExploreItem[],
  filters: { q?: string; category?: string | null },
): ExploreItem[] {
  const q = (filters.q ?? '').trim().toLowerCase()
  const category = filters.category ?? null
  return items.filter((i) => {
    if (category && i.category !== category) return false
    if (!q) return true
    const hay = [
      i.title,
      i.description,
      i.brandLabel,
      i.ownerDisplayName,
      i.ownerHandle,
      i.nearestLocationLabel,
      i.category,
      i.primaryTag,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

/**
 * Category options from the result set itself. Items carry their own category
 * vocabulary (community / repair / garden / food / crafts / education /
 * sustainability), not the retired vendor `CATEGORIES` slugs.
 */
export function exploreCategoryOptions(items: readonly ExploreItem[]): string[] {
  return Array.from(new Set(items.map((i) => i.category).filter((c): c is string => !!c))).sort()
}

/** Title-case a category slug for display: `honey-jams` → `Honey Jams`. */
export function categoryLabel(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Item ids whose gathering child carries a recurrence rule — the backing set
 * for the sheet's "Recurring" schedule option (T115).
 *
 * `recurrence_rule` is not projected into the MV, and adding it would mean a
 * fourth drop-and-rebuild of the view and its six indexes for one filter
 * option. `item_gatherings` reads through `select_via_parent`, which resolves
 * to the same published/listed visibility gate the MV encodes, so this second
 * (id-only) read sees exactly the rows a browse may see.
 */
export async function fetchRecurringGatheringIds(client: FromClient): Promise<Set<string>> {
  try {
    const { data, error } = await client
      .from('item_gatherings')
      .select('item_id')
      .not('recurrence_rule', 'is', null)
    if (error) return new Set()
    return new Set(((data ?? []) as { item_id: string }[]).map((r) => r.item_id))
  } catch {
    return new Set()
  }
}

// T079 — Public product resolver (F038 Item page).
// Spec:   planning/now/scenario-F038-producer-lists-product.md
// Ticket: development/tickets/T079-product-item-page.md
//
// Resolves a published kind='product' Item for the public page at
//   /p/[…place]/g/[group-slug]/p/[item-slug]   (filed under a business Group)
//   /m/[handle]/p/[item-slug]                   (sold as individual)
//
// items has no slug column at b1 (see T079 DEVIATIONS). The composer (T078)
// builds the URL slug as `toSlug(title)-<first 8 chars of items.id>`; the
// trailing fragment is the addressing key. We resolve the owning scope
// (Group or Member), then match the row whose id starts with that fragment.
// RLS (items_select_published) is the visibility gate — drafts never resolve.
//
// Supabase-client-shaped (session-bound), same convention as resolve-shop.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { itemLocationLabel } from './item-location'

export interface ResolvedProductPickup {
  label: string
}

/**
 * T095 — Item attribution model. Items filed under a Group attribute to the Group
 * (always public); items sold as an individual attribute to the Member with a
 * conditional link. T137 — the link follows publishing: a Member who has
 * published anything links; one who has published nothing is plain text.
 */
export type ItemAttribution =
  | { kind: 'group'; name: string }
  // #253: an item posted without a Page names nobody.
  | { kind: 'none' }

export interface ResolvedProduct {
  itemId: string
  title: string
  description: string
  priceCents: number | null
  priceUnit: string | null
  photoUrls: string[]
  /** Group display_name (denormalized onto items.brand_label); null when sold as individual.
   *  Kept for generateMetadata page-title fallback; attribution drives all surfaces. */
  brandLabel: string | null
  attribution: ItemAttribution
  pickup: ResolvedProductPickup | null
  /** F039 — null until a Locally Made claim lands; gates the badge. */
  madeAtPlaceId: string | null
}

/**
 * Split a place catch-all slug array at `/g/<group>/p/<item>`.
 * `['ca','sacramento','oak-park','g','oak-park-sourdough-a1','p','loaf-deadbeef']`
 *   → { placeSegments: ['ca','sacramento','oak-park'], groupSlug: 'oak-park-sourdough-a1', itemSlug: 'loaf-deadbeef' }
 * Returns null for a bare `…/g/<group>` (that stays the Shop page) or any
 * path without the trailing `/p/<item>`.
 */
export function splitItemSlug(
  segments: string[],
): { placeSegments: string[]; groupSlug: string; itemSlug: string } | null {
  const gIndex = segments.indexOf('g')
  if (gIndex === -1) return null
  const groupSlug = segments[gIndex + 1]
  if (!groupSlug) return null
  // Inner product marker: the segment after the group slug must be 'p'.
  if (segments[gIndex + 2] !== 'p') return null
  const itemSlug = segments[gIndex + 3]
  if (!itemSlug) return null
  return { placeSegments: segments.slice(0, gIndex), groupSlug, itemSlug }
}

/** The addressing key is the slug's trailing hyphen segment (first 8 chars of
 *  the item id). Returns '' for a slug with no hyphen (won't match anything). */
export function parseIdFragment(itemSlug: string): string {
  const idx = itemSlug.lastIndexOf('-')
  return idx === -1 ? '' : itemSlug.slice(idx + 1)
}

interface ProductRow {
  id: string
  title: string
  description: string
  brand_label: string | null
  made_at_place_id: string | null
  item_products:
    | { price_cents: number | null; price_unit: string | null; photo_urls: string[] }[]
    | { price_cents: number | null; price_unit: string | null; photo_urls: string[] }
    | null
}

function firstEmbed<T>(embed: T[] | T | null | undefined): T | null {
  if (Array.isArray(embed)) return embed[0] ?? null
  return embed ?? null
}

export async function resolveProduct(
  supabase: SupabaseClient,
  args: { groupSlug?: string; handle?: string; itemSlug: string },
): Promise<ResolvedProduct | null> {
  const idFrag = parseIdFragment(args.itemSlug)
  if (!idFrag) return null

  // Resolve the owning scope to a filter on items.
  let scope: {
    column: 'group_id' | 'id'
    value: string
    individual: boolean
    /** T119 — Group display name, the attribution fallback when brand_label is null. */
    groupName: string | null
  } | null = null
  if (args.groupSlug) {
    const { data: g } = await supabase
      .from('groups')
      .select('id, name')
      .eq('slug', args.groupSlug)
      .eq('kind', 'business')
      .limit(1)
      .maybeSingle()
    if (!g) return null
    const grp = g as { id: string; name: string | null }
    scope = { column: 'group_id', value: grp.id, individual: false, groupName: grp.name ?? null }
  } else if (args.handle) {
    // #253 — an item posted without a Page, from the handle and id in its URL.
    // Nobody reads who posted it, so nothing here names them.
    const { data } = await supabase.rpc('posted_item_id', {
      p_handle: args.handle,
      p_kind: 'product',
      p_id_prefix: idFrag,
    })
    if (!data) return null
    scope = { column: 'id', value: data as string, individual: true, groupName: null }
  }
  if (!scope) return null

  // T095 — Group-filed items attribute to the Group; individual items to nobody.
  const baseSelect =
    'id, title, description, brand_label, made_at_place_id, ' +
    'item_products(price_cents, price_unit, photo_urls)'
  let query = supabase
    .from('items')
    .select(baseSelect)
    .eq(scope.column, scope.value)
    .eq('kind', 'product')
    .eq('state', 'published')
    .is('deleted_at', null)
  // Individual products carry no Group filing.
  if (scope.individual) query = query.is('group_id', null)

  const { data, error } = await query
  if (error || !data) return null

  const row = (data as unknown as ProductRow[]).find((r) => r.id.slice(0, 8) === idFrag)
  if (!row) return null

  const prod = firstEmbed(row.item_products)

  // F093 criterion 8 — read on its own, as the caller; signed out it is refused.
  const locationLabel = await itemLocationLabel(supabase, row.id)

  // Build attribution by scope.
  let attribution: ItemAttribution
  if (scope.individual) {
    attribution = { kind: 'none' }
  } else {
    // Group-filed: brand_label is the denormalized Group display_name.
    // T119 — brand_label is denormalized from group_businesses.display_name, so
    // it is null for every non-business Group. Group events are filed under
    // event_anchored / interest / place / practice Groups, which made every one
    // of them unresolvable. Fall back to the Group's own name.
    const groupName = row.brand_label ?? scope.groupName
    if (!groupName) return null
    attribution = { kind: 'group', name: groupName }
  }

  return {
    itemId: row.id,
    title: row.title,
    description: row.description,
    priceCents: prod?.price_cents ?? null,
    priceUnit: prod?.price_unit ?? null,
    photoUrls: prod?.photo_urls ?? [],
    brandLabel: row.brand_label,
    attribution,
    pickup: locationLabel ? { label: locationLabel } : null,
    madeAtPlaceId: row.made_at_place_id,
  }
}

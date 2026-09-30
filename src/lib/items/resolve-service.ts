// T083 — Public service resolver (F040 Item page).
// Spec:   planning/now/scenario-F040-producer-lists-service.md
// Ticket: development/tickets/T083-service-item-page.md
//
// Resolves a published kind='service' Item for the public page at
//   /p/[…place]/g/[group-slug]/s/[item-slug]   (filed under a business Group)
//   /m/[handle]/s/[item-slug]                   (sold as individual)
//
// Mirrors resolve-product.ts: items has no slug column at b1, so the URL slug
// is `toSlug(title)-<first 8 chars of items.id>` and we match the trailing
// fragment. RLS (items_select_published) is the visibility gate.

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseIdFragment } from './resolve-product'
import type { ItemAttribution } from './resolve-product'
import type { RateModel } from '@/components/sell/ServiceComposer'

export interface ResolvedServiceAnchor {
  label: string
}

export interface ResolvedService {
  itemId: string
  title: string
  description: string
  rateModel: RateModel
  rateCents: number | null
  /** True when a service_area_geography circle is set (drives the area section). */
  hasServiceArea: boolean
  /** Group display_name (denormalized onto items.brand_label); null when individual.
   *  Kept for generateMetadata page-title fallback; attribution drives all surfaces. */
  brandLabel: string | null
  attribution: ItemAttribution
  /** Optional anchor Location label (the service-area center). */
  anchor: ResolvedServiceAnchor | null
}

/**
 * Split a place catch-all slug array at `/g/<group>/s/<item>`.
 * Returns null for a product path (`/p/`), a bare `…/g/<group>`, or any path
 * without the trailing `/s/<item>`.
 */
export function splitServiceSlug(
  segments: string[],
): { placeSegments: string[]; groupSlug: string; itemSlug: string } | null {
  const gIndex = segments.indexOf('g')
  if (gIndex === -1) return null
  const groupSlug = segments[gIndex + 1]
  if (!groupSlug) return null
  // Inner service marker: the segment after the group slug must be 's'.
  if (segments[gIndex + 2] !== 's') return null
  const itemSlug = segments[gIndex + 3]
  if (!itemSlug) return null
  return { placeSegments: segments.slice(0, gIndex), groupSlug, itemSlug }
}

interface ServiceRow {
  id: string
  title: string
  description: string
  brand_label: string | null
  member_id: string
  item_services:
    | {
        rate_model: string
        rate_cents: number | null
        service_area_geography: string | null
      }[]
    | { rate_model: string; rate_cents: number | null; service_area_geography: string | null }
    | null
  item_locations:
    | { removed_at: string | null; locations: { label: string }[] | { label: string } | null }[]
    | null
}

function firstEmbed<T>(embed: T[] | T | null | undefined): T | null {
  if (Array.isArray(embed)) return embed[0] ?? null
  return embed ?? null
}

type PostAuthor = { member_id: string; display_name: string; avatar_url: string | null }

export async function resolveService(
  supabase: SupabaseClient,
  args: { groupSlug?: string; handle?: string; itemSlug: string },
): Promise<ResolvedService | null> {
  const idFrag = parseIdFragment(args.itemSlug)
  if (!idFrag) return null

  // Resolve the owning scope to a filter on items.
  let poster: PostAuthor | null = null
  let scope: {
    column: 'group_id' | 'member_id'
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
    // #246 — nobody reads another member's row. This names the poster of an
    // item posted without a Page, by the handle already in its URL.
    const { data } = await supabase.rpc('post_author_public', { p_handle: args.handle })
    const author = ((data as PostAuthor[] | null) ?? [])[0]
    if (!author) return null
    poster = author
    scope = { column: 'member_id', value: author.member_id, individual: true, groupName: null }
  }
  if (!scope) return null

  // T095 — Group-filed services attribute to the Group; individual services to
  // the poster named above.
  const baseSelect =
    'id, title, description, brand_label, member_id, ' +
    'item_services(rate_model, rate_cents, service_area_geography), ' +
    'item_locations(removed_at, locations(label))'
  let query = supabase
    .from('items')
    .select(baseSelect)
    .eq(scope.column, scope.value)
    .eq('kind', 'service')
    .eq('state', 'published')
    .is('deleted_at', null)
  // Individual services carry no Group filing.
  if (scope.individual) query = query.is('group_id', null)

  const { data, error } = await query
  if (error || !data) return null

  const row = (data as unknown as ServiceRow[]).find((r) => r.id.slice(0, 8) === idFrag)
  if (!row) return null

  const svc = firstEmbed(row.item_services)

  // First active (non-removed) anchor Location.
  const activeLoc = (row.item_locations ?? []).find((il) => il.removed_at === null)
  const locEmbed = activeLoc ? firstEmbed(activeLoc.locations) : null

  let attribution: ItemAttribution
  if (scope.individual) {
    if (!poster) return null
    attribution = {
      kind: 'member',
      handle: args.handle!,
      displayName: poster.display_name,
      // #246 — a profile opens for its owner only, so the name links nowhere.
      hasPublished: false,
    }
  } else {
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
    rateModel: (svc?.rate_model ?? 'quote') as RateModel,
    rateCents: svc?.rate_cents ?? null,
    hasServiceArea: Boolean(svc?.service_area_geography),
    brandLabel: row.brand_label,
    attribution,
    anchor: locEmbed ? { label: locEmbed.label } : null,
  }
}

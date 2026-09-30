// T082 — Public gathering resolver (F034 Item page).
// Spec:   planning/now/scenario-F034-member-hosts-recurring-gathering.md
// Ticket: development/tickets/T082-gathering-item-page.md
//
// Resolves a published kind='gathering' Item for the public page at
//   /p/[…place]/g/[group-slug]/e/[item-slug]   (filed under a Group)
//   /m/[handle]/e/[item-slug]                   (hosted by a Member)
//
// id8-fragment addressing (no slug column on items at b1) — same convention as
// resolve-product.ts. RLS (items_select_published) is the visibility gate.

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseIdFragment } from './resolve-product'
import type { ItemAttribution } from './resolve-product'

export interface ResolvedGatheringLocation {
  label: string
}

export interface ResolvedGathering {
  itemId: string
  title: string
  description: string
  startsAt: string | null
  endsAt: string | null
  recurrenceRule: string | null
  capacity: number | null
  costCents: number | null
  whatToBring: string | null
  /** Group display_name (items.brand_label); null when hosted as a Member.
   *  Kept for generateMetadata page-title fallback; attribution drives all surfaces. */
  brandLabel: string | null
  attribution: ItemAttribution
  location: ResolvedGatheringLocation | null
}

/**
 * Split a place catch-all slug array at `/g/<group>/e/<item>`. Mirrors
 * splitItemSlug but the inner resource marker is `e` (gathering), not `p`.
 * Returns null for a bare `…/g/<group>` or a product `…/g/<group>/p/<item>`.
 */
export function splitGatheringSlug(
  segments: string[],
): { placeSegments: string[]; groupSlug: string; itemSlug: string } | null {
  const gIndex = segments.indexOf('g')
  if (gIndex === -1) return null
  const groupSlug = segments[gIndex + 1]
  if (!groupSlug) return null
  if (segments[gIndex + 2] !== 'e') return null
  const itemSlug = segments[gIndex + 3]
  if (!itemSlug) return null
  return { placeSegments: segments.slice(0, gIndex), groupSlug, itemSlug }
}

const WEEKDAYS: Record<string, string> = {
  SU: 'Sunday',
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
}

/** `FREQ=WEEKLY;BYDAY=TH` → "Every Thursday". Null/empty → null. b1 supports
 *  the weekly shape the composer writes; richer RRULEs degrade to null. */
export function describeRecurrence(rrule: string | null | undefined): string | null {
  if (!rrule) return null
  const m = /BYDAY=([A-Z]{2})/.exec(rrule)
  if (!m) return null
  const day = WEEKDAYS[m[1]]
  return day ? `Every ${day}` : null
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** The next occurrence at or after `now`. Non-recurring (or a future-dated
 *  start) returns the start itself; a past weekly start advances in whole-week
 *  steps until it reaches the future. Null start (open meetup) → null. */
export function nextOccurrence(
  startsAt: string | null,
  rrule: string | null,
  now: Date,
): Date | null {
  if (!startsAt) return null
  let occ = new Date(startsAt).getTime()
  if (rrule && /FREQ=WEEKLY/.test(rrule)) {
    const nowMs = now.getTime()
    while (occ < nowMs) occ += WEEK_MS
  }
  return new Date(occ)
}

interface GatheringChild {
  starts_at: string | null
  ends_at: string | null
  recurrence_rule: string | null
  capacity: number | null
  cost_cents: number | null
  what_to_bring: string | null
}

interface GatheringRow {
  id: string
  title: string
  description: string
  brand_label: string | null
  member_id: string
  item_gatherings: GatheringChild[] | GatheringChild | null
  item_locations:
    | { removed_at: string | null; locations: { label: string }[] | { label: string } | null }[]
    | null
}

function firstEmbed<T>(embed: T[] | T | null | undefined): T | null {
  if (Array.isArray(embed)) return embed[0] ?? null
  return embed ?? null
}

type PostAuthor = { member_id: string; display_name: string; avatar_url: string | null }

export async function resolveGathering(
  supabase: SupabaseClient,
  args: { groupSlug?: string; handle?: string; itemSlug: string },
): Promise<ResolvedGathering | null> {
  const idFrag = parseIdFragment(args.itemSlug)
  if (!idFrag) return null

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

  // T095 — Group-filed gatherings attribute to the Group; individual gatherings
  // to the host named above.
  const baseSelect =
    'id, title, description, brand_label, member_id, ' +
    'item_gatherings(starts_at, ends_at, recurrence_rule, capacity, cost_cents, what_to_bring), ' +
    'item_locations(removed_at, locations(label))'
  let query = supabase
    .from('items')
    .select(baseSelect)
    .eq(scope.column, scope.value)
    .eq('kind', 'gathering')
    .eq('state', 'published')
    .is('deleted_at', null)
  if (scope.individual) query = query.is('group_id', null)

  const { data, error } = await query
  if (error || !data) return null

  const row = (data as unknown as GatheringRow[]).find((r) => r.id.slice(0, 8) === idFrag)
  if (!row) return null

  const child = firstEmbed(row.item_gatherings)

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
    startsAt: child?.starts_at ?? null,
    endsAt: child?.ends_at ?? null,
    recurrenceRule: child?.recurrence_rule ?? null,
    capacity: child?.capacity ?? null,
    costCents: child?.cost_cents ?? null,
    whatToBring: child?.what_to_bring ?? null,
    brandLabel: row.brand_label,
    attribution,
    location: locEmbed ? { label: locEmbed.label } : null,
  }
}

// T156 — the browse read helper. One query behind Explore.
//
// It replaces `getBrowsePages` (T154) and `getBrowsePosts` (T162), which were
// two helpers over two RPCs at two grains with no consumer between them, and
// which between them could answer none of the four questions Explore now has
// to ask. The migration drops both functions in the same change; this file is
// their single successor.
//
// WHAT CHANGED, AND WHY EACH PIECE IS A PARAMETER
//
//   * **The follow set.** Browse carries a signed-in person's own
//     announcements and upcoming things, and signed out that half is absent
//     — **absent server-side, never rendered and hidden** (Don, 2026-09-17;
//     F059 criteria 2b/2c). So the set of Pages a member gets updates from is
//     an input to the query, and the withholding is the predicate rather than
//     a filter some caller is trusted to apply.
//
//   * **The Page kind.** Whether SocialUs has two Page kinds or three is
//     Don's, and unruled. A constant would have to be found and changed in
//     every read the day he rules; a parameter means the ruling lands as a
//     caller's argument. `resolveShop` is the cautionary tale — it hardcoded
//     `kind = 'business'` and 404'd a run club.
//
//   * **The lens axes.** Browse is a showcase carrying curated lenses as
//     horizontally scrolling rows, on time, product category and recency of
//     Page. Each lens is one call of THIS function with different arguments,
//     which is what makes "the row hides rather than showing an empty row" a
//     `length === 0` test rather than a second query.
//
// NOT HERE, DELIBERATELY: a cost parameter. "Free things" is the fourth lens
// axis and there is no price or cost anywhere on a Page or a post — the only
// price column in the schema belongs to `item_products`, on the noun the model
// says does not exist. Don still owes that decision. A stub parameter with
// nothing behind it would read as built.
//
// Ordering is locality and recency. Never payment, never what holds attention
// (F059 criterion 3). Community response may in principle order it and does
// not today — no Page or post carries a response count.

import type { SupabaseClient } from '@supabase/supabase-js'
import { decodeEwkbPoint } from '@/lib/explore/ewkb'
import { visiblePhotoUrl } from '@/lib/groups/visible-photo-url'
import { normalizeTag } from '@/lib/groups/tags'
import { clampLimit } from './locality-feed'

/** What a row IS. A Page and one of its posts are different results. */
export type BrowseResultKind = 'page' | 'post'

/**
 * `recent` — most recently updated first, the default browse order.
 * `soonest` — next occurrence first, for the time lens.
 * `newest`  — most recently created Page first, for the newcomers lens.
 */
export type BrowseSort = 'recent' | 'soonest' | 'newest'

/**
 * The locality. Exactly one, and the type says so: Explore scopes to a metro
 * (F059 criterion 6), while venue and place reads scope to a Place polygon.
 *
 * Both are ids, never slugs — `public.places` currently holds two rows sharing
 * the slug 'sacramento' (a recorded accepted risk), and resolving a slug is
 * `resolveFeedMetro` / `resolveFeedPlace`'s job, upstream of here.
 */
export type BrowseScope = { metroId: string } | { placeId: string }

/**
 * Whose browse this is.
 *
 * `public` is everything the reader is entitled to see and is the default.
 * `following` is the personal half, and it restricts to the given Pages —
 * so a signed-out reader (no set) and a signed-in reader who follows nothing
 * (an empty set) both get nothing, from the predicate, in the database.
 *
 * The set is carried on the same object as the word on purpose. A single
 * nullable `following` argument would let a forgotten set turn a "From Pages
 * you follow" row into the entire public feed, silently.
 */
export type BrowseAudience =
  | { audience: 'public' }
  | { audience: 'following'; following: readonly string[] }

export interface BrowseFeedOpts {
  scope: BrowseScope
  audience?: BrowseAudience
  /** Page kinds admitted. Omitted means every kind — no kind is baked in. */
  kinds?: readonly string[] | null
  /** Restrict to Pages, or to posts. Omitted means both. */
  resultKinds?: readonly BrowseResultKind[] | null
  /**
   * The product-category lens: Pages carrying any of these tags.
   *
   * Normalised through `normalizeTag` on the way out, because the database
   * matches on `tags.normalized` — the vocabulary's uniqueness key. A lens
   * defined as "Local Food" and a creator who typed "local food" are the same
   * tag, and a caller should not have to know that.
   */
  tags?: readonly string[] | null
  /** The time lens window. Both ends optional and independent. */
  startsFrom?: string | null
  startsBefore?: string | null
  /** The newcomers lens: Pages created since this instant. */
  createdAfter?: string | null
  sort?: BrowseSort
  /** The cutoff past-dated posts are judged against. Omitted, the db clock. */
  now?: string | null
  limit?: number | null
}

/** One row exactly as `browse_feed` returns it. */
export interface BrowseFeedRow {
  result_kind: BrowseResultKind
  result_id: string
  group_id: string
  group_kind: string
  slug: string
  name: string
  place_path: string | null
  photo_url: string | null
  photo_hidden_at: string | null
  photo_removed_at: string | null
  description: string | null
  body: string | null
  tags: string[] | null
  starts_at: string | null
  location_id: string | null
  location_label: string | null
  location_geography: string | null
  page_created_at: string
  updated_at: string
  sort_at: string
}

export interface BrowseResult {
  resultKind: BrowseResultKind
  /** The Page's id for a Page row, the post's id for a post row. */
  resultId: string
  /** The owning Page. Its identity travels with every post. */
  groupId: string
  groupKind: string
  slug: string
  name: string
  /** Canonical Page URL. Null when the place path did not resolve. */
  href: string | null
  /** Already through `visiblePhotoUrl` — a hidden or removed photo is gone. */
  photoUrl: string | null
  /** A Page's free text. Null on a post row. */
  description: string | null
  /** A post's own words. Null on a Page row. */
  body: string | null
  /** The owning Page's tags. Posts carry none of their own — see the SQL. */
  tags: string[]
  /** Null means undated, which is a first-class post, not a degraded event. */
  startsAt: string | null
  locationId: string | null
  locationLabel: string | null
  /** Map pin. Null when nothing resolvable was projected. */
  longitude: number | null
  latitude: number | null
  pageCreatedAt: string
  updatedAt: string
  /** Whatever key the chosen sort ordered on, so nothing re-sorts downstream. */
  sortAt: string
}

type RpcClient = Pick<SupabaseClient, 'rpc'>

/** A bad point loses its pin, never the row. */
function pointOf(ewkb: string | null): { longitude: number | null; latitude: number | null } {
  if (!ewkb) return { longitude: null, latitude: null }
  try {
    const p = decodeEwkbPoint(ewkb)
    return { longitude: p?.longitude ?? null, latitude: p?.latitude ?? null }
  } catch {
    return { longitude: null, latitude: null }
  }
}

/** `/p/<…place>/g/<slug>`, or null when either half is missing. */
export function browseHref(placePath: string | null, slug: string | null): string | null {
  const path = placePath?.trim()
  const s = slug?.trim()
  if (!path || !s) return null
  return `/p/${path}/g/${s}`
}

export function mapBrowseRow(r: BrowseFeedRow): BrowseResult {
  return {
    resultKind: r.result_kind,
    resultId: r.result_id,
    groupId: r.group_id,
    groupKind: r.group_kind,
    slug: r.slug,
    name: r.name,
    href: browseHref(r.place_path, r.slug),
    photoUrl: visiblePhotoUrl({
      photo_url: r.photo_url,
      photo_hidden_at: r.photo_hidden_at,
      photo_removed_at: r.photo_removed_at,
    }),
    description: r.description,
    body: r.body,
    tags: r.tags ?? [],
    startsAt: r.starts_at ?? null,
    locationId: r.location_id,
    locationLabel: r.location_label,
    ...pointOf(r.location_geography),
    pageCreatedAt: r.page_created_at,
    updatedAt: r.updated_at,
    sortAt: r.sort_at,
  }
}

/**
 * Read one page of browse.
 *
 * Throws on a read error rather than returning an empty array. A lens row that
 * must disappear on failure catches; a surface that swallows the error cannot
 * tell "nothing matched this lens" from "the query is broken", and the whole
 * point of the hide-an-empty-row rule is that an absent row means the first.
 */
export async function getBrowseFeed(
  supabase: RpcClient,
  opts: BrowseFeedOpts,
): Promise<BrowseResult[]> {
  const audience = opts.audience ?? { audience: 'public' }
  const { data, error } = await supabase.rpc('browse_feed', {
    p_metro_id: 'metroId' in opts.scope ? opts.scope.metroId : null,
    p_place_id: 'placeId' in opts.scope ? opts.scope.placeId : null,
    p_kinds: opts.kinds ? [...opts.kinds] : null,
    p_result_kinds: opts.resultKinds ? [...opts.resultKinds] : null,
    p_audience: audience.audience,
    p_following: audience.audience === 'following' ? [...audience.following] : null,
    p_tags: opts.tags ? opts.tags.map(normalizeTag) : null,
    p_starts_from: opts.startsFrom ?? null,
    p_starts_before: opts.startsBefore ?? null,
    p_created_after: opts.createdAfter ?? null,
    p_sort: opts.sort ?? 'recent',
    p_now: opts.now ?? null,
    p_limit: clampLimit(opts.limit),
  })
  if (error) throw error
  return ((data ?? []) as BrowseFeedRow[]).map(mapBrowseRow)
}

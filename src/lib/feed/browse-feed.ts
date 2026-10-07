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
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { announcementAnchor } from '@/components/group/announcement-anchor'
import { visiblePhotoUrl } from '@/lib/groups/visible-photo-url'
import { normalizeTag } from '@/lib/groups/tags'
import { clampLimit } from './locality-feed'
import { maskEmails, maskEmailsOrNull } from '../text/contact-info'

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
  /** #256 — a post's created_at: when it was posted. Null for a Page row. */
  posted_at: string | null
  /** #262 — a post's optional end. */
  ends_at?: string | null
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
  /** #256 — when a post was posted; `updatedAt` moves on every edit. */
  postedAt: string | null
  /** #262 — a post's optional end. */
  endsAt?: string | null
  /** Whatever key the chosen sort ordered on, so nothing re-sorts downstream. */
  sortAt: string
  /**
   * F093 — this row is the signed-out form: which Page posted, and how many
   * it has this period. No body, no time, no place.
   *
   * A flag rather than a separate type, so signed-out Explore keeps its
   * post-kind rows (criterion 7) through the same grid, the same search and
   * the same map without any of them learning about two shapes. It is always
   * a boolean and never undefined: a surface asking `withheld` must not have
   * a third state to get wrong.
   */
  withheld: boolean
  /**
   * F093 criterion 5 — announcements this Page has in the current period.
   * Null on anything a reader can actually read, because a member reads the
   * announcement itself rather than a count of them.
   */
  announcementCount: number | null
  /** F093 — every announcement id a withheld Page card answers to. */
  announcementIds: string[] | null
}

type RpcClient = Pick<SupabaseClient, 'rpc' | 'from'>

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

/**
 * The canonical Page address — `/g/<id>` (#411), or null with no id to resolve by.
 *
 * Issue #175. This used to be `/p/<place_path>/g/<slug>`, and `place_path` is
 * null for every Page a member created, so every one of those cards rendered
 * without a link. The address no longer depends on geography at all (ruled
 * 2026-09-21), which is what fixes it — and `place_path` stays in the row
 * because breadcrumbs and scoping still want it.
 */
export function browseHref(publicId: string | null): string | null {
  const id = publicId?.trim()
  return id ? canonicalPagePath(id) : null
}

/**
 * Where a result card goes.
 *
 * A Page row goes to its Page. AN ANNOUNCEMENT ROW GOES TO ITS ANNOUNCEMENT —
 * bug #211. Before this both went to the Page, so tapping an announcement
 * landed you at the top of a Page with no indication which one you had tapped,
 * and if you owned the Page you landed on the composer, which renders between
 * the heading and the list.
 *
 * A fragment rather than a route, because an announcement does not have its
 * own address yet. When it does, this is the one place that changes.
 */
export function resultHref(
  r: Pick<BrowseFeedRow, 'slug' | 'result_kind' | 'result_id'>,
  publicId: string | null,
): string | null {
  const page = browseHref(publicId)
  // No Page path means no link at all. A bare '#announcement-…' would be a
  // link that looks live and goes nowhere, which is worse than no link.
  if (!page) return null
  if (r.result_kind !== 'post') return page
  return `${page}#${announcementAnchor(r.result_id)}`
}

export function mapBrowseRow(r: BrowseFeedRow, publicId: string | null): BrowseResult {
  return {
    resultKind: r.result_kind,
    resultId: r.result_id,
    groupId: r.group_id,
    groupKind: r.group_kind,
    slug: r.slug,
    // #450 — stored Page text may carry an address; a card never shows it.
    name: maskEmails(r.name),
    href: resultHref(r, publicId),
    photoUrl: visiblePhotoUrl({
      photo_url: r.photo_url,
      photo_hidden_at: r.photo_hidden_at,
      photo_removed_at: r.photo_removed_at,
    }),
    description: maskEmailsOrNull(r.description),
    body: maskEmailsOrNull(r.body),
    tags: r.tags ?? [],
    startsAt: r.starts_at ?? null,
    locationId: r.location_id,
    locationLabel: r.location_label,
    ...pointOf(r.location_geography),
    pageCreatedAt: r.page_created_at,
    updatedAt: r.updated_at,
    postedAt: r.posted_at ?? null,
    endsAt: r.ends_at ?? null,
    sortAt: r.sort_at,
    withheld: false,
    announcementCount: null,
    announcementIds: null,
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
  const rows = (data ?? []) as BrowseFeedRow[]
  const publicIds = await fetchPagePublicIds(supabase, rows.map((r) => r.group_id))
  return rows.map((r) => mapBrowseRow(r, publicIds.get(r.group_id) ?? null))
}

/**
 * The public ids for a result set's Pages, in one read.
 *
 * A second round trip rather than a column on `browse_feed`, deliberately: the
 * feed function's signature is shared by the map, the list and the snapshot,
 * and changing a `returns table` means dropping and recreating all 390 lines
 * of it. This is a primary-key lookup over at most one page of results.
 *
 * A failure costs the cards their links and never the feed — the same rule
 * `fetchGroupPrefixes` follows, and the same rule that made this bug quiet for
 * so long, so it is worth saying out loud: a missing id is a dead card.
 */
async function fetchPagePublicIds(
  supabase: RpcClient,
  groupIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(groupIds.filter(Boolean)))
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  const { data, error } = await supabase.from('groups').select('id, public_id').in('id', ids)
  if (error || !data) return out
  for (const row of data as { id: string; public_id: string | null }[]) {
    if (row.public_id) out.set(row.id, row.public_id)
  }
  return out
}

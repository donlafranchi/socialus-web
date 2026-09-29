// T074 — Public Shop resolver (F035 read surface).
// Spec:   planning/now/scenario-F035-rosa-finds-mayas-shop.md
// Ticket: development/tickets/T074-shop-public-page.md
//
// Resolves a kind='business' Group ("Shop") for the public page at
// /p/[…place]/g/[slug]. RLS does the visibility work (T070's
// groups_select_active_or_own_draft): a returned 'draft' row implies the
// viewer is the founder (founder_member_id = auth.uid()), so the page can
// render the owner preview off lifecycleState alone. A non-owner / anon
// viewing a draft, dissolved, or nonexistent slug gets no row → null → 404.
//
// Supabase-client-shaped (not pg-shaped) so it runs from a server component
// with the session-bound client. Same convention as src/lib/sell/getDraftGroup.ts.

import { managingRoleForKind, type GroupKind } from '@/actions/group/constants'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normaliseSocialLinks, type SocialLinks } from './social-links'
import { resolvePagePlacements, type Placement } from './resolve-page-placement'

export type GroupLifecycleState = 'draft' | 'active' | 'dissolved'

export interface ShopFounder {
  handle: string
  displayName: string
  avatarUrl: string | null
  /** T137 — gates the conditional link on the "Founded by" line; plain text when false. */
  hasPublished: boolean
}

export interface ResolvedShop {
  groupId: string
  slug: string
  /** Issue #175 — what the canonical address resolves by. The slug beside it
   *  in that address is cosmetic and may change; this does not. */
  publicId: string
  /** The Page kind. Always 'business' while this resolver filters on it, but
   *  carried rather than assumed — the managing role is derived from it, and a
   *  wrong assumption here hides the owner's own controls from them. */
  kind: string
  displayName: string
  publicDescription: string
  lifecycleState: GroupLifecycleState
  anchorLocationId: string | null
  /** T144 — the fixed-vocabulary term, or null (either pre-T144 row,
   *  T159 — always null now: categories are retired and nothing writes
   *  `groups.category`. Kept on the type so the column can be dropped in a
   *  separate, reversible cleanup rather than in the same change. */
  category: string | null
  /** T145/T160 — the stored URL. Never project this directly: every surface
   *  that renders a Page photo goes through `visiblePhotoUrl()`, which is
   *  what makes a hide a hide. */
  photoUrl: string | null
  /** F070 — the Page's links out. Empty object means none. */
  socialLinks: SocialLinks
  /** T160 — non-null means hidden pending operator review (T159). */
  photoHiddenAt: string | null
  /** F067 — a private Page is joined; anything else is followed. */
  discoverability: string
  founder: ShopFounder | null
  /** T143 — where this Page currently resolves to. A list, not a single
   *  point: at most one today (the anchor); bounded at two once
   *  appearances land (the anchor plus at most one active appearance). */
  placements: Placement[]
}

export interface ShopItem {
  id: string
  title: string
  kind: string
}

export interface LocalOwnerBadge {
  label: string
}

/** T096 — the acting owner's own claim state, backing the F037 management widget.
 *  `zip` is null when the owner hasn't claimed; `isProximal` reports whether that
 *  ZIP currently earns the public badge (render-time derivation, not validation). */
export interface OwnerClaim {
  zip: string | null
  isProximal: boolean
}

const LOCAL_OWNER_LABEL = 'Claimed local owner'

/**
 * Split a place catch-all slug array at the `/g/` marker.
 * `['ca','sacramento','oak-park','g','oak-park-sourdough']`
 *   → { placeSegments: ['ca','sacramento','oak-park'], groupSlug: 'oak-park-sourdough' }
 * Returns null when there is no group segment (bare place path) or when the
 * `g` marker has no slug after it. A Group slug is a single segment; anything
 * past it (Item segments) is out of F035 scope.
 */
export function splitGroupSlug(
  segments: string[],
): { placeSegments: string[]; groupSlug: string } | null {
  const gIndex = segments.indexOf('g')
  if (gIndex === -1) return null
  const groupSlug = segments[gIndex + 1]
  if (!groupSlug) return null
  return { placeSegments: segments.slice(0, gIndex), groupSlug }
}

// PostgREST returns an embedded relation as either an array or a single
// object depending on cardinality hints. Normalise to the first row.
function firstEmbed<T>(embed: T[] | T | null | undefined): T | null {
  if (Array.isArray(embed)) return embed[0] ?? null
  return embed ?? null
}

interface ShopRow {
  id: string
  slug: string
  public_id: string
  kind: string
  /** The Page's own name. What every kind but `business` is known by. */
  name: string | null
  /** The Page's own free text. Same story as `name`. */
  description: string | null
  lifecycle_state: string
  anchor_location_id: string | null
  category: string | null
  photo_url: string | null
  social_links: unknown
  photo_hidden_at: string | null
  discoverability: string
  group_businesses:
    | { display_name: string; public_description: string }[]
    | { display_name: string; public_description: string }
    | null
}

interface FounderRow {
  handle: string
  display_name: string
  avatar_url: string | null
  has_published: boolean
}

export interface ResolveShopOptions {
  /**
   * T156 — the Page kinds this read admits. Omitted or empty means **every
   * kind**, which is the only correct default: `groups.slug` is globally
   * unique, so a kind predicate here can do exactly one thing — 404 a Page
   * that exists.
   *
   * It is a parameter rather than a constant because whether SocialUs has two
   * Page kinds or three is Don's, and unruled. A caller that genuinely needs
   * one kind passes it; the ruling, when it lands, lands at the call sites
   * instead of forcing this read to be rewritten.
   */
  kinds?: readonly string[]
  /**
   * Issue #175 — which column the key is.
   *
   * `publicId` is what a canonical address resolves by. `slug` remains the
   * default because every address shared before the ruling of 2026-09-21 is
   * slug-shaped, and those redirect rather than breaking.
   */
  by?: 'slug' | 'publicId'
}

export async function resolveShop(
  supabase: SupabaseClient,
  /** A slug, or a `public_id` when `opts.by` says so. */
  key: string,
  opts: ResolveShopOptions = {},
): Promise<ResolvedShop | null> {
  // CORRECTED 2026-09-19 (T156). This was `.eq('kind', 'business')`, which
  // 404'd every Page that is not a business — a run club, an interest Page, a
  // practice — even though each one resolves, renders and is owned exactly
  // like a Shop. Don hit it himself with SacRiver Floaters.
  let query = supabase
    .from('groups')
    .select(
      'id, slug, public_id, kind, name, description, lifecycle_state, anchor_location_id, category, ' +
        'photo_url, social_links, photo_hidden_at, discoverability, ' +
        'group_businesses(display_name, public_description)',
    )
    .eq(opts.by === 'publicId' ? 'public_id' : 'slug', key)
  if (opts.kinds && opts.kinds.length > 0) query = query.in('kind', [...opts.kinds])

  const { data, error } = await query.limit(1).maybeSingle()

  if (error || !data) return null

  const row = data as unknown as ShopRow
  const biz = firstEmbed(row.group_businesses)
  // #241 — never through groups.founder_member_id, which a stranger may not
  // read: embedding through it fails the whole query and 404s the Page. The
  // function returns the founder without their id, and T137's "has published"
  // with it, since that too was keyed by the id.
  const { data: founderData } = await supabase.rpc('page_founder_public', { p_group_id: row.id })
  const founderRow = ((founderData as FounderRow[] | null) ?? [])[0] ?? null

  // T144 — a Page's own free text when it chose "Something else" instead
  // of a fixed term, shown publicly (same treatment as the fixed-term
  // case — the review's own language: "renders on the Page as the
  // Member's own words," to any viewer). Only queried when there's no
  // fixed category. pg-pool-shaped, not Supabase-client-shaped, because
  // group_category_suggestions' own RLS (T141) scopes SELECT to the

  // T143 — resolved at read time, never stored. pg-shaped (not
  // Supabase-client-shaped like the rest of this function) because
  // extracting lng/lat from a `geography` column needs raw SQL
  // (st_x/st_y) — the same reason sellActivateAction's place-path
  // resolution also reaches for the action-layer pool instead of
  // PostgREST. See T143 DEVIATIONS for the two-credential-path note.
  const placements = await resolvePagePlacements(row.id)

  return {
    groupId: row.id,
    kind: row.kind,
    slug: row.slug,
    publicId: row.public_id,
    // T156 — a business keeps its public name in the `group_businesses` child;
    // every other kind of Page keeps it on the `groups` row and has no child
    // at all. Falling back is what makes resolving a run club worth doing:
    // without it the 404 is replaced by a Page with no name on it.
    displayName: biz?.display_name ?? row.name ?? '',
    publicDescription: biz?.public_description ?? row.description ?? '',
    lifecycleState: row.lifecycle_state as GroupLifecycleState,
    anchorLocationId: row.anchor_location_id,
    category: row.category,
    photoUrl: row.photo_url,
    // Normalised on read as well as on write: a row written before the column
    // had its CHECK, or by anything that bypassed the action layer, must not
    // reach an href unchecked.
    socialLinks: normaliseSocialLinks(row.social_links).links,
    photoHiddenAt: row.photo_hidden_at,
    discoverability: row.discoverability,
    placements,
    founder: founderRow
      ? {
          handle: founderRow.handle,
          displayName: founderRow.display_name,
          avatarUrl: founderRow.avatar_url,
          hasPublished: founderRow.has_published,
        }
      : null,
  }
}

export async function resolveShopItems(
  supabase: SupabaseClient,
  groupId: string,
): Promise<ShopItem[]> {
  const { data, error } = await supabase
    .from('items')
    .select('id, title, kind')
    .eq('group_id', groupId)
    .in('kind', ['product', 'service'])
    .eq('state', 'published')
    .is('deleted_at', null)
  if (error || !data) return []
  return (data as ShopItem[]).map((r) => ({ id: r.id, title: r.title, kind: r.kind }))
}

/** Render-time proximity test (T075's SECURITY DEFINER function, granted to
 *  anon + authenticated). Null-safe: any RPC error or non-true result → false,
 *  so a missing-data join never earns the badge. */
async function zipIsProximal(
  supabase: SupabaseClient,
  zip: string,
  locationId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('zip_is_proximal_to_location', {
    zip,
    location_id: locationId,
  })
  if (error) return false
  return data === true
}

/**
 * Beat 2 — "Claimed local owner" badge (F037 read path over T075's substrate).
 *
 * Selects the Group's active jurisdiction rows (public-read RLS
 * `mbj_select_public_active`) and runs the proximity test per ZIP. Returns the
 * badge if ANY active owner's ZIP shares the anchor Location's MSA
 * (OR-aggregation per `business-jurisdiction.md` line 50). Returns null when
 * there is no anchor Location, no active row, or no ZIP passes — no
 * "not locally owned" negative space.
 */
export async function resolveLocalOwnerBadge(
  supabase: SupabaseClient,
  shop: { groupId: string; anchorLocationId: string | null },
): Promise<LocalOwnerBadge | null> {
  if (!shop.anchorLocationId) return null
  const { data, error } = await supabase
    .from('member_business_jurisdictions')
    .select('zip')
    .eq('group_id', shop.groupId)
    .is('removed_at', null)
  if (error || !data) return null
  for (const row of data as { zip: string }[]) {
    if (await zipIsProximal(supabase, row.zip, shop.anchorLocationId)) {
      return { label: LOCAL_OWNER_LABEL }
    }
  }
  return null
}

/**
 * F037 owner widget — the acting viewer's own claim state for this Shop.
 *
 * Returns null unless the viewer is an active owner-role member of the Group
 * (self-read RLS `memberships_select_self`), so non-owners and anon never see
 * the management surface. For an owner, returns their own active jurisdiction
 * ZIP (or null when unclaimed) plus whether it currently earns the badge.
 */
/**
 * T160 — is the viewer an owner of this Page?
 *
 * Owner-role membership, the same test `resolveOwnerClaim` applies. Split out
 * because the hidden-photo notice needs ownership on its own, without the
 * jurisdiction lookups that claim state drags in — and because a notice that
 * renders for the wrong viewer is a privacy failure, so the test it depends on
 * should be one obvious function rather than a side effect of another.
 */
export async function viewerOwnsPage(
  supabase: SupabaseClient,
  args: { groupId: string; viewerMemberId: string | null; kind?: string | null },
): Promise<boolean> {
  if (!args.viewerMemberId) return false
  // CORRECTED 2026-09-18. This asked for role='owner' unconditionally, and a
  // non-business Page's founder holds 'steward' — never 'owner'. So the founder
  // of a run club, an interest Page or a practice was not recognised as owning
  // their own Page, and every owner-only affordance was hidden from them. The
  // same trap `group.update_draft` warns about in its own comments.
  //
  // `kind` is optional so older callers still compile; without it, either
  // managing role counts, which is the safer default for a read that only
  // decides whether to SHOW a control. The write handlers check the exact role
  // for the exact kind, so a wrong answer here cannot authorise anything.
  const roles = args.kind
    ? [managingRoleForKind(args.kind as GroupKind)]
    : ['owner', 'steward']
  const { data } = await supabase
    .from('group_memberships')
    .select('role')
    .eq('group_id', args.groupId)
    .eq('member_id', args.viewerMemberId)
    .in('role', roles)
    .is('left_at', null)
    .limit(1)
    .maybeSingle()
  return Boolean(data)
}

/**
 * F067 — does this viewer already follow (or belong to) this Page?
 *
 * Their own row is readable through `memberships_select_self` whatever the
 * relationship, so this works for a follower of an open Page as well as a
 * member of a private one.
 */
export async function viewerFollowsPage(
  supabase: SupabaseClient,
  args: { groupId: string; viewerMemberId: string | null },
): Promise<boolean> {
  if (!args.viewerMemberId) return false
  const { data } = await supabase
    .from('group_memberships')
    .select('relationship')
    .eq('group_id', args.groupId)
    .eq('member_id', args.viewerMemberId)
    .is('left_at', null)
    .limit(1)
    .maybeSingle()
  return Boolean(data)
}

export async function resolveOwnerClaim(
  supabase: SupabaseClient,
  args: { groupId: string; anchorLocationId: string | null; viewerMemberId: string | null },
): Promise<OwnerClaim | null> {
  if (!args.viewerMemberId) return null

  const { data: membership } = await supabase
    .from('group_memberships')
    .select('role')
    .eq('group_id', args.groupId)
    .eq('member_id', args.viewerMemberId)
    .eq('role', 'owner')
    .is('left_at', null)
    .limit(1)
    .maybeSingle()
  if (!membership) return null

  const { data: row } = await supabase
    .from('member_business_jurisdictions')
    .select('zip')
    .eq('group_id', args.groupId)
    .eq('member_id', args.viewerMemberId)
    .is('removed_at', null)
    .limit(1)
    .maybeSingle()
  const zip = (row as { zip: string } | null)?.zip ?? null
  if (!zip) return { zip: null, isProximal: false }

  const isProximal = args.anchorLocationId
    ? await zipIsProximal(supabase, zip, args.anchorLocationId)
    : false
  return { zip, isProximal }
}

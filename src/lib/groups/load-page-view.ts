// Everything the Page surface needs, in one place.
//
// Issue #175 — this was inline in the `/p/[...slug]` catch-all, which is now an
// index that redirects rather than a second home for a Page. Lifted out so the
// canonical route is the only thing rendering a Page, and so the next surface
// that needs it does not copy the six reads and get one of them wrong.

import { resolvePageMetadata } from './page-metadata'
import { viewerId } from '@/lib/auth/viewer'
import { resolvePageTags } from './page-tags'
import { componentOn } from './page-components'
import { resolvePageContact, type PageContact } from './page-contact'
import { resolvePageWhere, type PageWhere } from './page-where'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveShopItems,
  resolveLocalOwnerBadge,
  resolveOwnerClaim,
  viewerOwnsPage,
  viewerRelationship,
  type ResolvedShop,
  type ShopItem,
  type LocalOwnerBadge,
  type OwnerClaim,
} from './resolve-shop'
import { resolvePagePosts, type PagePost } from './page-posts'
import { countPageFollowers } from '@/lib/follows/follower-count'

export interface PageView {
  /** #625 — the owner's own name and description while a report hides them from others; null otherwise. */
  ownWords: { name: string; description: string } | null
  items: ShopItem[]
  posts: PagePost[]
  badge: LocalOwnerBadge | null
  ownerClaim: OwnerClaim | null
  viewerOwnsPage: boolean
  viewerFollows: boolean
  /** bug #338 — their row is a membership, not a follow. */
  viewerIsMember: boolean
  loggedIn: boolean
  /** F072 criterion 4 — how many people get updates from this Page. Zero for
   *  anyone who does not run it: the count sits inside the composer, and
   *  nobody else has one. */
  followerCount: number
  /** #301 — how many tags a draft has, for its owner's publish checklist.
   *  Zero for anyone else and for a live Page. */
  draftTagCount: number
  /** #302 — for the owner's in-place editor: who's editing, and whether
   *  hours and phone are on (Don, 2026-10-04). */
  viewerMemberId: string | null
  contactOn: boolean
  /** #363 — Products & services: on for a business, added by any other Page. */
  productsOn: boolean
  /** #316 — the Page's tags. */
  tags: string[]
  /** #293 — phone and hours; the phone is null signed out (F134). */
  contact: PageContact | null
  /** #348 — where it is. */
  where: PageWhere | null
}

export async function loadPageView(
  supabase: SupabaseClient,
  shop: ResolvedShop,
): Promise<PageView> {
  // #791 — who is looking is read from the session's verified claims, with no
  // round trip, so every read below starts at once: one round to the database
  // (#529 had it at two, behind a call to the auth server). Only the owner's two
  // extras wait for `owns`.
  const viewerMemberId = await viewerId(supabase)
  const signedIn = viewerMemberId !== null

  const [items, posts, badge, ownerClaim, owns, relationship, tags, contact, where, metadata] = await Promise.all([
    resolveShopItems(supabase, shop.groupId),
    // RLS is the visibility gate here too: the owner's own posts come back for
    // the owner and for nobody else.
    resolvePagePosts(supabase, shop.groupId),
    resolveLocalOwnerBadge(supabase, {
      groupId: shop.groupId,
      anchorLocationId: shop.anchorLocationId,
    }),
    resolveOwnerClaim(supabase, {
      groupId: shop.groupId,
      anchorLocationId: shop.anchorLocationId,
      viewerMemberId,
    }),
    viewerOwnsPage(supabase, {
      groupId: shop.groupId,
      viewerMemberId,
      // Without the kind this falls back to "either managing role", which is
      // silently wrong for every non-business Page — their founder holds
      // 'steward', not 'owner'.
      kind: shop.kind,
    }),
    viewerRelationship(supabase, { groupId: shop.groupId, viewerMemberId }),
    // F134 — tags, hours and where read signed out as a signed-in stranger reads them; the phone stays for members.
    resolvePageTags(supabase, shop.groupId),
    resolvePageContact(supabase, shop.groupId, signedIn),
    resolvePageWhere(supabase, shop.groupId),
    resolvePageMetadata(supabase, shop.groupId),
  ])

  // Asked for only when there is somewhere to show it. RLS would return zero
  // to a non-owner anyway (followers are excluded from
  // `memberships_select_listed_group` except for whoever runs the Page), but a
  // read nobody renders is a read worth not making.
  const [followerCount, draftTagCount] = owns
    ? await Promise.all([
        countPageFollowers(supabase, shop.groupId),
        shop.lifecycleState === 'draft'
          ? supabase
              .from('page_tags')
              .select('tag_id', { count: 'exact', head: true })
              .eq('group_id', shop.groupId)
              .then((r) => r.count ?? 0)
          : Promise.resolve(0),
      ])
    : [0, 0]

  const contactOn = owns ? componentOn(shop.kind, metadata, 'contact') : false
  const productsOn = componentOn(shop.kind, metadata, 'products')

  // #625 — the owner sees their own words, masked for everyone else, and a note on how to show them again.
  const ownWords =
    owns && shop.wordsHidden
      ? await supabase
          .from('groups')
          .select('name, description')
          .eq('id', shop.groupId)
          .maybeSingle()
          .then(({ data }) => (data ? { name: (data as { name: string }).name, description: (data as { description: string | null }).description ?? '' } : null))
      : null

  return {
    ownWords,
    items,
    posts,
    badge,
    ownerClaim,
    viewerOwnsPage: owns,
    viewerMemberId,
    contactOn,
    productsOn,
    viewerFollows: relationship !== null,
    viewerIsMember: relationship === 'member',
    loggedIn: signedIn,
    followerCount,
    draftTagCount,
    tags,
    contact,
    where,
  }
}

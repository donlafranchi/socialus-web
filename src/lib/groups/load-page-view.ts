// Everything the Page surface needs, in one place.
//
// Issue #175 — this was inline in the `/p/[...slug]` catch-all, which is now an
// index that redirects rather than a second home for a Page. Lifted out so the
// canonical route is the only thing rendering a Page, and so the next surface
// that needs it does not copy the six reads and get one of them wrong.

import { resolvePageMetadata } from './page-metadata'
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
import { getWithheldAnnouncements } from '@/lib/feed/withheld-announcements'
import { metroWeekBounds } from '@/lib/metro/metro-week'
import type { BrowseResult } from '@/lib/feed/browse-feed'

export interface PageView {
  items: ShopItem[]
  posts: PagePost[]
  /**
   * F093 — the same announcements, in the form a stranger may see: which ones
   * exist and how many this week, never what they say.
   *
   * Always `[]` for a signed-in member, who has `posts` instead. The two are
   * never both populated, and that is the shape of criterion 6: the signed-in
   * surface is not a withheld surface with extra fields, it is untouched.
   */
  withheldPosts: BrowseResult[]
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
  /** #316 — the Page's tags; empty signed out (F093). */
  tags: string[]
  /** #293 — phone and hours, for signed-in visitors only; null signed out. */
  contact: PageContact | null
  /** #348 — where it is: signed-in visitors only; null signed out. */
  where: PageWhere | null
}

export async function loadPageView(
  supabase: SupabaseClient,
  shop: ResolvedShop,
): Promise<PageView> {
  const [items, posts, badge, { data: auth }] = await Promise.all([
    resolveShopItems(supabase, shop.groupId),
    // RLS is the visibility gate here too: the owner's own posts come back for
    // the owner and for nobody else.
    resolvePagePosts(supabase, shop.groupId),
    resolveLocalOwnerBadge(supabase, {
      groupId: shop.groupId,
      anchorLocationId: shop.anchorLocationId,
    }),
    supabase.auth.getUser(),
  ])

  const viewerMemberId = auth.user?.id ?? null

  // One round for everything that does not depend on another read (#529: these
  // were eight rounds in a row, each a trip to the database). Only the owner's
  // two extras wait for `owns`.
  const [ownerClaim, owns, relationship, tags, contact, where, withheldPosts, metadata] = await Promise.all([
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
    auth.user ? resolvePageTags(supabase, shop.groupId) : Promise.resolve([] as string[]),
    auth.user ? resolvePageContact(supabase, shop.groupId) : Promise.resolve(null),
    auth.user ? resolvePageWhere(supabase, shop.groupId) : Promise.resolve(null),
    // F093 criterion 9 — signed out, `page_posts` returns nothing, so without
    // this the Announcements section would not render at all and an
    // `#announcement-<id>` link from Explore would scroll to nothing. That is
    // the dead end #211 fixed, reintroduced at a different door.
    //
    // A failure costs the announcements and never the Page, the rule
    // `resolvePagePosts` already follows.
    auth.user
      ? Promise.resolve([] as BrowseResult[])
      : getWithheldAnnouncements(supabase, {
          scope: { groupId: shop.groupId },
          period: metroWeekBounds(),
        }).catch((error) => {
          console.error('[loadPageView] withheld announcements failed:', (error as Error).message)
          return [] as BrowseResult[]
        }),
    // One read of metadata: the owner's components, and whether a signed-in
    // visitor sees Products & services (#363: a component any Page can add).
    // An owner is always signed in, so signed in is the whole condition.
    auth.user ? resolvePageMetadata(supabase, shop.groupId) : Promise.resolve(null),
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

  return {
    items,
    posts,
    withheldPosts,
    badge,
    ownerClaim,
    viewerOwnsPage: owns,
    viewerMemberId,
    contactOn,
    productsOn,
    viewerFollows: relationship !== null,
    viewerIsMember: relationship === 'member',
    loggedIn: Boolean(auth.user),
    followerCount,
    draftTagCount,
    tags,
    contact,
    where,
  }
}

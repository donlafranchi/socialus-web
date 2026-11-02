// The Page's body, read and rendered behind its outline (#537). Shared by the Page's address and a post's own
// address under it (Don, 2026-10-31), which is the same Page landed on one post.

import { createClient } from '@/lib/supabase-server'
import { viewerId } from '@/lib/auth/viewer'
import { pagePath } from '@/lib/groups/page-handle'
import { loadPageView } from '@/lib/groups/load-page-view'
import { ShopPublicPage } from '@/components/group/ShopPublicPage'
import { loadViewerReminders, NO_REMINDERS } from '@/lib/reminders/viewer-reminders'
import type { ResolvedShop } from '@/lib/groups/resolve-shop'
import { loadPageSearchDemand } from '@/lib/search/page-demand'
import { loadWonderViews } from '@/lib/wonders/wonder-view'
import { loadHeartView } from '@/lib/hearts/heart-view'
import type { SharedPostPreview } from '@/components/group/WithheldPagePosts'

export async function PageBody({ shop: resolved, focusPostId = null, preview = null }: { shop: ResolvedShop; focusPostId?: string | null; preview?: SharedPostPreview | null }) {
  let shop = resolved
  const supabase = await createClient()
  // #978 — the viewer's reminders ride along with the Page's reads instead of waiting behind them; an owner's are dropped.
  const remindersAsked = (await viewerId(supabase)) ? loadViewerReminders(supabase, true).catch(() => NO_REMINDERS) : null
  const view = await loadPageView(supabase, shop)
  // #909 — the owner's card; the database answers only a manager of this Page.
  // F117 — each Wonder's bar, helpers and the viewer's own state; the split and names only for its managers (the database decides).
  const wonderIds = view.loggedIn ? view.posts.filter((p) => p.wonder).map((p) => p.id) : []
  // #1171 — hearts: names for the Page's managers; nothing for anyone else while public counts are off (the database decides).
  const [searchDemand, wonders, hearts] = await Promise.all([
    view.viewerOwnsPage ? loadPageSearchDemand(supabase, shop.groupId) : Promise.resolve(null),
    wonderIds.length ? loadWonderViews(supabase, wonderIds) : Promise.resolve({}),
    view.loggedIn ? loadHeartView(supabase, shop.groupId).catch(() => null) : Promise.resolve(null),
  ])
  // #945 — the viewer's own reminders, read under their session (nobody else's are readable).
  const reminders = view.viewerOwnsPage ? NO_REMINDERS : ((await remindersAsked) ?? NO_REMINDERS)
  // #625 — only the owner gets their hidden words back, and only here, after ownership is known.
  if (view.ownWords) shop = { ...shop, displayName: view.ownWords.name, publicDescription: view.ownWords.description }

  return (
    <ShopPublicPage
      shop={shop}
      items={view.items}
      badge={view.badge}
      loggedIn={view.loggedIn}
      ownerClaim={view.ownerClaim}
      viewerOwnsPage={view.viewerOwnsPage}
      viewerFollows={view.viewerFollows}
      viewerIsMember={view.viewerIsMember}
      posts={view.posts}
      withheldPosts={view.withheldPosts}
      followerCount={view.followerCount}
      viewerMemberId={view.viewerMemberId}
      contactOn={view.contactOn}
      productsOn={view.productsOn}
      draftTagCount={view.draftTagCount}
      tags={view.tags}
      contact={view.contact}
      where={view.where}
      searchDemand={searchDemand}
      reminders={reminders}
      wonders={wonders}
      hearts={hearts}
      pagePath={pagePath(shop)}
      focusPostId={focusPostId}
      sharedPreview={preview}
    />
  )
}

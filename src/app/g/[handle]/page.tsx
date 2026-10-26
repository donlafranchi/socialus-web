// A Page, at its address: /g/<id>, the only one (#411; the PM, 2026-10-06).
// No geography in it ("addresses/locations will evolve"), no name, nothing
// derived from a member ("keep members safe from people with bad intentions"),
// per the 2026-09-21 ruling. Older forms are not forwarded while there are no
// members to protect; they are not found.

import { cache, Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { viewerId } from '@/lib/auth/viewer'
import { resolvePageById } from '@/lib/groups/resolve-page-address'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { loadPageView } from '@/lib/groups/load-page-view'
import { ShopPublicPage } from '@/components/group/ShopPublicPage'
import { loadViewerReminders, NO_REMINDERS } from '@/lib/reminders/viewer-reminders'
import { PageSkeleton } from '@/components/group/PageSkeleton'
import type { ResolvedShop } from '@/lib/groups/resolve-shop'
import { shareMetadata } from '@/lib/groups/share-metadata'
import { loadPageSearchDemand } from '@/lib/search/page-demand'

interface Props {
  params: Promise<{ handle: string }>
}

// bug #457 — resolved once per request: generateMetadata and the page both ask,
// and each ask reads through the database pool.
const shopFor = cache(async (handle: string) => resolvePageById(await createClient(), handle))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  const shop = await shopFor(handle)
  if (!shop) return { title: 'Not found — SocialUs' }
  return shareMetadata(shop)
}

// #537 — whether the Page exists (404 for a missing or draft one) is decided before
// anything streams, so the status stays honest; the heavy reads then happen behind
// the outline, which is what answers the tap.
export default async function PageAtCanonicalAddress({ params }: Props) {
  const { handle } = await params
  const shop = await shopFor(handle)
  if (!shop) notFound()
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PageBody shop={shop} />
    </Suspense>
  )
}

async function PageBody({ shop: resolved }: { shop: ResolvedShop }) {
  let shop = resolved
  const supabase = await createClient()
  // #978 — the viewer's reminders ride along with the Page's reads instead of waiting behind them; an owner's are dropped.
  const remindersAsked = (await viewerId(supabase)) ? loadViewerReminders(supabase, true).catch(() => NO_REMINDERS) : null
  const view = await loadPageView(supabase, shop)
  // #909 — the owner's card; the database answers only a manager of this Page.
  const searchDemand = view.viewerOwnsPage ? await loadPageSearchDemand(supabase, shop.groupId) : null
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
      pagePath={canonicalPagePath(shop.publicId)}
    />
  )
}

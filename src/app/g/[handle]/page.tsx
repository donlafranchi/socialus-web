// A Page, at its address: /g/<id>, the only one (#411; the PM, 2026-10-06).
// No geography in it ("addresses/locations will evolve"), no name, nothing
// derived from a member ("keep members safe from people with bad intentions"),
// per the 2026-09-21 ruling. Older forms are not forwarded while there are no
// members to protect; they are not found.

import { cache, Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { resolvePageById } from '@/lib/groups/resolve-page-address'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { loadPageView } from '@/lib/groups/load-page-view'
import { ShopPublicPage } from '@/components/group/ShopPublicPage'
import { PageSkeleton } from '@/components/group/PageSkeleton'
import type { ResolvedShop } from '@/lib/groups/resolve-shop'
import { shareMetadata } from '@/lib/groups/share-metadata'

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

async function PageBody({ shop }: { shop: ResolvedShop }) {
  const supabase = await createClient()
  const view = await loadPageView(supabase, shop)

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
      pagePath={canonicalPagePath(shop.publicId)}
    />
  )
}

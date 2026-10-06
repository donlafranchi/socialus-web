// A Page, at its address: /g/<id>, the only one (#411; the PM, 2026-10-06).
// No geography in it ("addresses/locations will evolve"), no name, nothing
// derived from a member ("keep members safe from people with bad intentions"),
// per the 2026-09-21 ruling. Older forms are not forwarded while there are no
// members to protect; they are not found.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { resolvePageById } from '@/lib/groups/resolve-page-address'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { loadPageView } from '@/lib/groups/load-page-view'
import { ShopPublicPage } from '@/components/group/ShopPublicPage'

interface Props {
  params: Promise<{ handle: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  const supabase = await createClient()
  const shop = await resolvePageById(supabase, handle)
  if (!shop) return { title: 'Not found — SocialUs' }
  return {
    title: `${shop.displayName} — SocialUs`,
    description: shop.publicDescription || `${shop.displayName} on SocialUs.`,
  }
}

export default async function PageAtCanonicalAddress({ params }: Props) {
  const { handle } = await params
  const supabase = await createClient()

  const shop = await resolvePageById(supabase, handle)
  if (!shop) notFound()
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

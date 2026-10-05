// A Page, at its canonical address.
//
// Issue #175. `/g/<slug>-<id>` — a cosmetic slug and a short non-sequential
// ID, ruled by Don on 2026-09-21 (ops-pattern planning/URL-IDENTITY.md). No
// geography in it, because "addresses/locations will evolve … right now we're
// using metros but one day may use neighborhoods", and nothing derived from a
// member, because "I want to keep members safe from people with bad
// intentions."
//
// THIS IS THE ONLY ROUTE THAT RENDERS A PAGE. Every other shape — a place
// path, a stale slug, an address typed in upper case — redirects here
// permanently. Serving a Page at two addresses is the defect on #175, where
// /p/ca/sacramento/g/mayas-bakery and /p/ny/albany/g/mayas-bakery both
// rendered the same Page and neither was canonical.

import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { resolvePageByHandle } from '@/lib/groups/resolve-page-address'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { loadPageView } from '@/lib/groups/load-page-view'
import { ShopPublicPage } from '@/components/group/ShopPublicPage'

interface Props {
  params: Promise<{ handle: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  const supabase = await createClient()
  const found = await resolvePageByHandle(supabase, handle)
  if (!found) return { title: 'Not found — SocialUs' }
  return {
    title: `${found.shop.displayName} — SocialUs`,
    description: found.shop.publicDescription || `${found.shop.displayName} on SocialUs.`,
  }
}

export default async function PageAtCanonicalAddress({ params }: Props) {
  const { handle } = await params
  const supabase = await createClient()

  const found = await resolvePageByHandle(supabase, handle)
  if (!found) notFound()
  if (found.redirectTo) permanentRedirect(found.redirectTo)

  const { shop } = found
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
      badges={view.badges}
      productsOn={view.productsOn}
      draftTagCount={view.draftTagCount}
      tags={view.tags}
      contact={view.contact}
      pagePath={canonicalPagePath(shop.slug, shop.publicId)}
    />
  )
}

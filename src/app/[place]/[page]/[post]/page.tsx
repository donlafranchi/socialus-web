// #1139 (Don, 2026-11-01) — a post at its address: /<place>-<st>/<page-slug>/<post-slug>. The Page landed on the post,
// so whoever opens it sees what they would see on the Page (Don, 2026-10-31; signed out, the withheld treatment led by
// the headline, lead line and photo, #1126). A post this reader could not read there is not found here.

import { cache, Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { resolvePageByAddress } from '@/lib/groups/resolve-page-address'
import { resolvePostIdBySlug, resolveSharedPost } from '@/lib/posts/resolve-shared-post'
import { postShareMetadata, sharedPostLeadLine, sharedPostTitle } from '@/lib/posts/share-metadata'
import { PageSkeleton } from '@/components/group/PageSkeleton'
import { PageBody } from '@/app/g/[handle]/page-body'

interface Props {
  params: Promise<{ place: string; page: string; post: string }>
}

const shopFor = cache(async (place: string, page: string) => resolvePageByAddress(await createClient(), place, page))
const postFor = cache(async (place: string, page: string, slug: string) => {
  const shop = await shopFor(place, page)
  if (!shop) return null
  const supabase = await createClient()
  const id = await resolvePostIdBySlug(supabase, shop, slug)
  const shared = id ? await resolveSharedPost(supabase, shop, id) : null
  return id && shared ? { id, shared } : null
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { place, page, post } = await params
  const [shop, found] = await Promise.all([shopFor(place, page), postFor(place, page, post)])
  if (!shop || !found) return { title: 'Not found — SocialUs' }
  const { shared, id } = found
  return postShareMetadata({ page: shop, post: shared.access === 'full' ? shared.post : shared.preview, postId: id, postUrlSlug: post })
}

export default async function PostAtItsAddress({ params }: Props) {
  const { place, page, post } = await params
  const shop = await shopFor(place, page)
  if (!shop) notFound()
  const found = await postFor(place, page, post)
  if (!found) notFound()
  const { shared, id } = found
  const preview =
    shared.access === 'withheld'
      ? { title: sharedPostTitle(shared.preview, shop.displayName), leadLine: sharedPostLeadLine(shared.preview), photoUrl: shared.preview.photoUrl }
      : null
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PageBody shop={shop} focusPostId={id} preview={preview} />
    </Suspense>
  )
}

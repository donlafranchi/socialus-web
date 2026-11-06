// A post at its own address: /g/<page id>/posts/<post id> (Don, 2026-10-31: "I can't share an anouncment?"). It is the
// Page landed on the post, so whoever opens it sees what they would see on the Page: a member the post; a signed-out
// visitor the withheld treatment (F093) led by the post's headline, lead line and photo (Don, B, #1126), never its
// body. A post this reader could not read there is not found here.

import { cache, Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { resolvePageById } from '@/lib/groups/resolve-page-address'
import { resolveSharedPost } from '@/lib/posts/resolve-shared-post'
import { postShareMetadata, sharedPostLeadLine, sharedPostTitle } from '@/lib/posts/share-metadata'
import { PageSkeleton } from '@/components/group/PageSkeleton'
import { PageBody } from '../../page-body'

interface Props {
  params: Promise<{ handle: string; postId: string }>
}

const shopFor = cache(async (handle: string) => resolvePageById(await createClient(), handle))
const postFor = cache(async (handle: string, postId: string) => {
  const shop = await shopFor(handle)
  return shop ? resolveSharedPost(await createClient(), shop, postId) : null
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, postId } = await params
  const [shop, shared] = await Promise.all([shopFor(handle), postFor(handle, postId)])
  if (!shop || !shared) return { title: 'Not found — SocialUs' }
  return postShareMetadata({ page: shop, post: shared.access === 'full' ? shared.post : shared.preview, postId, postUrlSlug: shared.access === 'full' ? shared.post.urlSlug : null })
}

export default async function PostAtItsAddress({ params }: Props) {
  const { handle, postId } = await params
  const shop = await shopFor(handle)
  if (!shop) notFound()
  const shared = await postFor(handle, postId)
  if (!shared) notFound()
  const preview =
    shared.access === 'withheld'
      ? { title: sharedPostTitle(shared.preview, shop.displayName), leadLine: sharedPostLeadLine(shared.preview), photoUrl: shared.preview.photoUrl }
      : null
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PageBody shop={shop} focusPostId={postId} preview={preview} />
    </Suspense>
  )
}

// #1139 — a post by its id under a readable Page address: what a share made before the page learned the post's slug
// carries. It goes on to /<place>/<page>/<post-slug>; a post with no slug shows the Page landed on the post.

import { Suspense } from 'react'
import { notFound, permanentRedirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { resolvePageByAddress } from '@/lib/groups/resolve-page-address'
import { pagePath } from '@/lib/groups/page-handle'
import { resolveSharedPost } from '@/lib/posts/resolve-shared-post'
import { postPath } from '@/lib/posts/post-path'
import { PageSkeleton } from '@/components/group/PageSkeleton'
import { PageBody } from '@/app/g/[handle]/page-body'

export default async function PostById({ params }: { params: Promise<{ place: string; page: string; postId: string }> }) {
  const { place, page, postId } = await params
  const supabase = await createClient()
  const shop = await resolvePageByAddress(supabase, place, page)
  if (!shop) notFound()
  const shared = await resolveSharedPost(supabase, shop, postId)
  if (!shared) notFound()
  if (shared.urlSlug) permanentRedirect(postPath(pagePath(shop), shared))
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PageBody shop={shop} focusPostId={postId} />
    </Suspense>
  )
}

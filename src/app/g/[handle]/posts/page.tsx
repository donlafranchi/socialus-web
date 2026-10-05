// #367 — every post a Page has made, newest first, a tap from its latest three
// (Instagram, Facebook Pages, Airbnb's "Show all"). Signed out, the same
// withheld summary the Page shows (F093 criterion 9).

import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { resolvePageByHandle } from '@/lib/groups/resolve-page-address'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { loadPageView } from '@/lib/groups/load-page-view'
import { PagePosts } from '@/components/group/PagePosts'
import { WithheldPagePosts } from '@/components/group/WithheldPagePosts'
import { postToPageAction, editPagePostAction, deletePagePostAction } from '@/app/_actions/page-post-actions'

interface Props {
  params: Promise<{ handle: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  const found = await resolvePageByHandle(await createClient(), handle)
  return { title: found ? `Posts — ${found.shop.displayName} — SocialUs` : 'Not found — SocialUs' }
}

export default async function PagePostsScreen({ params }: Props) {
  const { handle } = await params
  const supabase = await createClient()
  const found = await resolvePageByHandle(supabase, handle)
  if (!found) notFound()
  const pagePath = canonicalPagePath(found.shop.slug, found.shop.publicId)
  if (found.redirectTo) permanentRedirect(`${pagePath}/posts`)

  const { shop } = found
  const view = await loadPageView(supabase, shop)

  return (
    <main className="mx-auto w-full max-w-read gutter py-6 pb-nav">
      <Link href={pagePath} className="press -ml-2 inline-flex min-h-tap items-center gap-1 px-2 text-body-sm font-medium text-[var(--color-accent)]">
        <ChevronLeft size={16} aria-hidden="true" />
        {shop.displayName}
      </Link>
      {view.withheldPosts.length > 0 ? (
        <WithheldPagePosts posts={view.withheldPosts} />
      ) : (
        <PagePosts
          groupId={shop.groupId}
          posts={view.posts}
          canPost={view.viewerOwnsPage}
          followerCount={view.followerCount}
          onPost={postToPageAction}
          onEdit={editPagePostAction}
          onDelete={deletePagePostAction}
        />
      )}
    </main>
  )
}

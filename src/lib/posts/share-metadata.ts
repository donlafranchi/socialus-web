// Don, 2026-10-31: "I can't share an anouncment?" — every post has its own address under its Page, and a shared
// link previews like the card: the headline, the lead line KIND · WHEN · WHERE, and the card's one picture.
// What the reader may not read previews with none of the post's words: the builder is handed `post: null` then,
// because the caller's read under RLS returned nothing to hand it.
//
// [open-question owner=don raised=2026-10-31] Link previews are fetched signed out, and F093 withholds a post's words from anyone signed out, so a shared post previews as "A post from <Page>" rather than its headline. Show the headline and lead line in previews of shared posts?

import type { Metadata } from 'next'
import { siteOrigin } from '@/lib/site-url'
import { shareMetadata } from '@/lib/groups/share-metadata'
import { visiblePhotoUrl } from '@/lib/groups/visible-photo-url'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { WITHHELD_DETAILS } from '@/components/browse/withheld-copy'
import { cardHeadline, leadLine } from './lead-line'
import { postPath } from './post-path'
import type { PostKind } from './kinds'

interface PageForShare {
  displayName: string
  publicDescription: string
  slug: string
  publicId: string
  lifecycleState: string
  photoUrl: string | null
  photoHiddenAt: string | null
  photoRemovedAt: string | null
  /** F099 — the Page picture, already resolved (null when none, hidden or removed). */
  pictureUrl?: string | null
}

export interface PostForShare {
  id: string
  kind?: PostKind
  headline?: string | null
  body: string
  startsAt: string | null
  endsAt?: string | null
  createdAt: string
  locationLabel: string | null
  photoUrl?: string | null
  hiddenAt?: string | null
  sampleKind?: string | null
}

export const withheldPostTitle = (pageName: string) => `A post from ${pageName}`

export function postShareMetadata({
  page,
  post,
  postId,
  now = new Date(),
}: {
  page: PageForShare
  /** Null when this reader may not read it (signed out: F093). */
  post: PostForShare | null
  postId?: string
  now?: Date
}): Metadata {
  if (page.lifecycleState !== 'active') return shareMetadata(page)
  const origin = siteOrigin()
  const url = `${origin}${postPath(canonicalPagePath(page.publicId), post?.id ?? postId ?? '')}`
  const pagePicture = page.pictureUrl ?? visiblePhotoUrl({ photo_url: page.photoUrl, photo_hidden_at: page.photoHiddenAt, photo_removed_at: page.photoRemovedAt })
  const readable = post && !post.hiddenAt ? post : null
  const photo = (readable?.photoUrl ?? null) || pagePicture
  const image = photo ? { url: photo } : { url: `${origin}/og-default`, width: 1200, height: 630 }
  const title = readable ? cardHeadline({ headline: readable.headline, body: readable.body, pageName: page.displayName }) : withheldPostTitle(page.displayName)
  const description = readable
    ? leadLine({ kind: readable.kind ?? 'news', startsAt: readable.startsAt, endsAt: readable.endsAt, postedAt: readable.createdAt, where: readable.locationLabel, sample: Boolean(readable.sampleKind) }, now)
    : WITHHELD_DETAILS
  return {
    title: `${title} — SocialUs`,
    description,
    alternates: { canonical: url },
    ...(post?.hiddenAt ? { robots: { index: false, follow: false } } : {}),
    openGraph: { title, description, url, siteName: 'SocialUs', type: 'article', images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}

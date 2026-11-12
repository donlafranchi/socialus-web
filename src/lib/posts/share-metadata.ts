// Don, 2026-10-31: "I can't share an anouncment?" — every post has its own address under its Page, and a shared
// link previews like the card: the headline, the lead line KIND · WHEN · WHERE, and the card's one picture.
// Previews are fetched signed out, so a signed-out reader is handed the post without its body (Don, B, #1126): the
// headline, lead line and photo; the details stay for members (F093). With no headline the title is the Page's,
// never a line from the body. What the reader may not read at all previews with none of its words (`post: null`).

import type { Metadata } from 'next'
import { siteOrigin } from '@/lib/site-url'
import { shareMetadata } from '@/lib/groups/share-metadata'
import { visiblePhotoUrl } from '@/lib/groups/visible-photo-url'
import { pagePath } from '@/lib/groups/page-handle'
import { WITHHELD_DETAILS } from '@/components/browse/withheld-copy'
import { cardHeadline, leadLine, venueShow } from './lead-line'
import { postPath } from './post-path'
import type { PostKind } from './kinds'

interface PageForShare {
  displayName: string
  publicDescription: string
  slug: string
  publicId: string
  placeUrlSlug?: string | null
  pageUrlSlug?: string | null
  wordsHidden?: boolean
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
  /** Absent when read signed out: the body never leaves the database then. */
  body?: string | null
  startsAt: string | null
  endsAt?: string | null
  createdAt: string
  locationLabel: string | null
  photoUrl?: string | null
  hiddenAt?: string | null
  sampleKind?: string | null
  /** The post's own tags, when read: they tell a venue show's kind (#1127). */
  tags?: string[]
}

export const withheldPostTitle = (pageName: string) => `A post from ${pageName}`

export const sharedPostTitle = (post: PostForShare, pageName: string) =>
  post.body != null ? cardHeadline({ headline: post.headline, body: post.body, pageName }) : post.headline?.trim() || withheldPostTitle(pageName)

export const sharedPostLeadLine = (post: PostForShare, now = new Date()) =>
  leadLine({ kind: post.kind ?? 'news', startsAt: post.startsAt, endsAt: post.endsAt, postedAt: post.createdAt, where: post.locationLabel, sample: Boolean(post.sampleKind), show: venueShow({ body: post.body, tags: post.tags ?? [] }) }, now)

export function postShareMetadata({
  page,
  post,
  postId,
  postUrlSlug,
  now = new Date(),
}: {
  page: PageForShare
  /** Without `body` when read signed out; null when this reader may not read it at all. */
  post: PostForShare | null
  postId?: string
  /** #1139 — the post's slug, so the preview names its readable address. */
  postUrlSlug?: string | null
  now?: Date
}): Metadata {
  if (page.lifecycleState !== 'active') return shareMetadata(page)
  const origin = siteOrigin()
  const url = `${origin}${postPath(pagePath(page), { id: post?.id ?? postId ?? '', urlSlug: postUrlSlug })}`
  const pagePicture = page.pictureUrl ?? visiblePhotoUrl({ photo_url: page.photoUrl, photo_hidden_at: page.photoHiddenAt, photo_removed_at: page.photoRemovedAt })
  const readable = post && !post.hiddenAt ? post : null
  const photo = (readable?.photoUrl ?? null) || pagePicture
  const image = photo ? { url: photo } : { url: `${origin}/og-default`, width: 1200, height: 630 }
  const title = readable ? sharedPostTitle(readable, page.displayName) : withheldPostTitle(page.displayName)
  const description = readable ? sharedPostLeadLine(readable, now) : WITHHELD_DETAILS
  return {
    title: `${title} — SocialUs`,
    description,
    alternates: { canonical: url },
    ...(post?.hiddenAt ? { robots: { index: false, follow: false } } : {}),
    openGraph: { title, description, url, siteName: 'SocialUs', type: 'article', images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}

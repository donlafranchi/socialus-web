// #409 — what a shared Page link shows in a preview: its name, description,
// one canonical address and its picture (the site's when it has none, or when
// its picture is hidden or removed). A draft has no preview and is not indexed.

import type { Metadata } from 'next'
import { siteOrigin } from '@/lib/site-url'
import { canonicalPagePath } from './page-handle'
import { visiblePhotoUrl } from './visible-photo-url'

interface PageForMetadata {
  displayName: string
  publicDescription: string
  slug: string
  publicId: string
  lifecycleState: string
  photoUrl: string | null
  photoHiddenAt: string | null
  photoRemovedAt: string | null
}

export function shareMetadata(page: PageForMetadata): Metadata {
  const title = page.displayName
  const description = page.publicDescription?.trim() || `${title} on SocialUs.`
  if (page.lifecycleState !== 'active') {
    return { title: `${title} — SocialUs`, description, robots: { index: false, follow: false } }
  }
  const origin = siteOrigin()
  const url = `${origin}${canonicalPagePath(page.slug, page.publicId)}`
  const photo = visiblePhotoUrl({ photo_url: page.photoUrl, photo_hidden_at: page.photoHiddenAt, photo_removed_at: page.photoRemovedAt })
  const image = photo ? { url: photo } : { url: `${origin}/og-default`, width: 1200, height: 630 }
  return {
    title: `${title} — SocialUs`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'SocialUs', type: 'website', images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}

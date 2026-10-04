'use client'

// F093 criterion 9 — the Page's announcements, as a stranger sees them.
//
// Signed out, `page_posts` returns nothing, so this is not `PagePosts` with
// the bodies blanked: it is a different read, and the body never arrives here
// to be hidden.
//
// ONE CARD for the Page (amended 2026-09-27), because the projection is one
// row per Page. It carries an empty anchor for every announcement id, so an
// `#announcement-<id>` link — from Explore, or shared by a member — lands on
// this card and marks it, rather than scrolling to nothing (#211).

import Link from 'next/link'
import { buttonClass } from '@/components/ui/Button'
import { Megaphone } from 'lucide-react'
import { announcementAnchor } from './announcement-anchor'
import { ANNOUNCEMENT_MARK, useAnnouncementAnchor } from './use-announcement-anchor'
import { ANNOUNCE_ANCHOR } from './announce-anchor'
import type { BrowseResult } from '@/lib/feed/browse-feed'
import {
  WITHHELD_CTA,
  WITHHELD_DETAILS,
  withheldCountLabel,
  withheldJoinHref,
} from '@/components/browse/withheld-copy'

export function WithheldPagePosts({ posts }: { posts: BrowseResult[] }) {
  const highlighted = useAnnouncementAnchor()
  const [page] = posts

  // A heading over nothing tells a stranger less than no heading does.
  if (!page) return null

  const ids = page.announcementIds ?? [page.resultId]
  const marked = highlighted !== null && ids.includes(highlighted)

  return (
    <section id={ANNOUNCE_ANCHOR} className="mt-8 scroll-mt-20" data-testid="page-posts-withheld">
      <h2 className="text-lg font-medium">Announcements</h2>
      <div
        data-testid="page-post-withheld"
        data-highlighted={marked ? 'true' : undefined}
        className={`card mt-4 flex items-start gap-3 p-4${marked ? ANNOUNCEMENT_MARK : ''}`}
      >
        {ids.map((id) => (
          <span key={id} id={announcementAnchor(id)} aria-hidden className="sr-only scroll-mt-24" />
        ))}
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)]"
        >
          <Megaphone className="h-4 w-4 text-[var(--color-accent)]" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-fg)]">
            {withheldCountLabel(page.announcementCount ?? 0)}
          </p>
          <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">{WITHHELD_DETAILS}</p>
          <Link
            data-testid="withheld-cta"
            href={withheldJoinHref(page.href)}
            className={`${buttonClass('primary')} mt-3 hover:no-underline`}
          >
            {WITHHELD_CTA}
          </Link>
        </div>
      </div>
    </section>
  )
}

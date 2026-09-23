'use client'

// F093 criterion 9 — the Page's announcements, as a stranger sees them.
//
// Signed out, `page_posts` returns nothing, so this is not `PagePosts` with
// the bodies blanked: it is a different list over a different read, and the
// body never arrives here to be hidden. That is the point — a component that
// receives the body and declines to paint it is an inert guard under
// `[guard-proves-itself]`.
//
// It exists so an `#announcement-<id>` link a signed-out visitor follows lands
// on something. Without it the Page renders no Announcements section at all
// and the fragment scrolls to nothing, which is the dead end #211 fixed
// arriving again at a different door.
//
// The Page's own name is deliberately absent from each row: you are on the
// Page, and the header two inches up already says whose it is. The Explore
// card carries the name because there it is the only thing that does.

import Link from 'next/link'
import { announcementAnchor } from './announcement-anchor'
import { ANNOUNCEMENT_MARK, useAnnouncementAnchor } from './use-announcement-anchor'
import { ANNOUNCE_ANCHOR } from './announce-anchor'
import { METRO_WEEK_LABEL } from '@/lib/metro/metro-week'
import type { BrowseResult } from '@/lib/feed/browse-feed'

const JOIN_HREF = '/auth/signup'

export function WithheldPagePosts({ posts }: { posts: BrowseResult[] }) {
  const highlighted = useAnnouncementAnchor()

  // A heading over an empty list tells a stranger less than no heading does,
  // and an empty list is what most Pages have. `PagePosts` makes the same
  // call for a visitor who cannot post.
  if (posts.length === 0) return null

  return (
    <section
      id={ANNOUNCE_ANCHOR}
      className="mt-8 scroll-mt-20"
      data-testid="page-posts-withheld"
    >
      <h2 className="text-lg font-medium">Announcements</h2>
      <ul className="mt-4 flex flex-col gap-3">
        {posts.map((post) => {
          const count = post.announcementCount ?? 0
          return (
            <li
              key={post.resultId}
              id={announcementAnchor(post.resultId)}
              data-testid="page-post-withheld"
              data-highlighted={highlighted === post.resultId ? 'true' : undefined}
              className={`card p-3 scroll-mt-24${highlighted === post.resultId ? ANNOUNCEMENT_MARK : ''}`}
            >
              <p className="text-xs font-semibold text-[var(--color-accent)]">
                Posted an announcement
              </p>
              {count > 0 && (
                <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                  {count} announcement{count === 1 ? '' : 's'} {METRO_WEEK_LABEL}
                </p>
              )}
              <Link
                data-testid="withheld-cta"
                href={JOIN_HREF}
                className="press mt-2 inline-flex text-xs font-medium text-[var(--color-charcoal-900)] underline"
              >
                Become a member to read it
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

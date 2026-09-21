// A browse result as a card.
//
// Uses the card system rather than inventing another card — CardGrid decides
// how many cells there are and TileCard fills one, so the surface reflows from
// an iPhone mini to a 27-inch monitor with every card the same height.
//
// Pages and posts are different results and read as different cards, but both
// carry the Page's name (F059 criterion 9). A post adds one line saying when
// it is, and an undated post is a first-class post rather than a degraded
// event — it simply has no date line.

import { TileCard } from '@/components/cards'
import { browseCardLocation, browseCardTagline } from '@/lib/browse/card'
import type { BrowseResult } from '@/lib/feed/browse-feed'

/**
 * A date a person reads, not an ISO string. Local to the reader's device —
 * which is why the element carries `suppressHydrationWarning`: the server
 * renders this in its own timezone and the browser re-renders it in the
 * reader's, and those two strings are meant to differ.
 */
function whenLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function BrowseResultCard({ result }: { result: BrowseResult }) {
  const isPost = result.resultKind === 'post'
  return (
    <TileCard
      title={result.name}
      tagline={browseCardTagline(result)}
      location={browseCardLocation(result)}
      imageUrl={result.photoUrl}
      href={result.href}
      action={
        isPost ? (
          <span
            suppressHydrationWarning
            data-testid="browse-post-when"
            // Muted, not the accent token: at 12px the accent's 2.9:1 on
            // white is well short of AA, and a date is secondary anyway.
            className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]"
          >
            {result.startsAt ? whenLabel(result.startsAt) : 'Posted'}
          </span>
        ) : null
      }
    />
  )
}

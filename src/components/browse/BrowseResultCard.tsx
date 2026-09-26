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
import { WithheldAnnouncementCard } from './WithheldAnnouncementCard'
import { formatMetroDateTime } from '@/lib/metro/metro-time'
import { browseCardLocation, browseCardTagline } from '@/lib/browse/card'
import type { BrowseResult } from '@/lib/feed/browse-feed'

/**
 * A date a person reads, IN THE METRO'S TIMEZONE — the same as the Page.
 *
 * Bug #211. This used to format in the reader's device timezone, which is a
 * defensible thing for a card to do right up until its Page does something
 * else. `PagePosts` formats with `formatMetroDateTime`, so the same
 * announcement read "THU, SEP 24, 2:12 AM" on a card and "Wednesday,
 * September 23 at 7:12pm" on the Page — a different DAY, which reads as the
 * information being missing rather than as a rendering difference.
 *
 * An event happens in the metro's time whoever is reading about it. A person
 * in London looking at a Sacramento river float wants to know when to be at
 * the river, not what their own clock will say.
 *
 * No `suppressHydrationWarning` any more, and its absence is load-bearing: the
 * server and the browser now render the same string, so a mismatch is a real
 * bug and should be allowed to shout.
 */
function whenLabel(iso: string): string {
  return formatMetroDateTime(iso)
}

export function BrowseResultCard({ result }: { result: BrowseResult }) {
  // F093 — a withheld announcement is a different card, and the choice lives
  // here rather than in BrowseSurface so that every surface rendering browse
  // results gets it without being told: the grid, the map's list, and whatever
  // renders results next.
  if (result.withheld) return <WithheldAnnouncementCard result={result} />

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

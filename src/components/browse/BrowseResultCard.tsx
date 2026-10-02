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

import { TagChips } from '@/components/tags/TagChips'
import { TileCard } from '@/components/cards'
import { WithheldAnnouncementCard } from './WithheldAnnouncementCard'
import { formatCardWhen, formatPostedDate } from '@/lib/metro/metro-time'
import { cardImageAlt } from '@/lib/calendar/ics'
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
export function BrowseResultCard({
  result,
  as = 'li',
}: {
  result: BrowseResult
  /** #270 — 'div' when the caller already provides the list item. */
  as?: 'li' | 'div'
}) {
  // F093 — a withheld announcement is a different card, and the choice lives
  // here rather than in BrowseSurface so that every surface rendering browse
  // results gets it without being told: the grid, the map's list, and whatever
  // renders results next.
  if (result.withheld) return <WithheldAnnouncementCard result={result} as={as} />

  const isPost = result.resultKind === 'post'
  return (
    <TileCard
      as={as}
      title={result.name}
      tagline={browseCardTagline(result)}
      location={browseCardLocation(result)}
      imageUrl={result.photoUrl}
      imageAlt={cardImageAlt({
        title: result.name,
        when: isPost && result.startsAt ? formatCardWhen(result.startsAt) : null,
        place: result.locationLabel,
      })}
      href={result.href}
      action={
        isPost || result.tags.length > 0 ? (
          <div className="flex flex-col gap-2">
            {isPost &&
              // #256 (F072 criterion 3): when it happens leads, large; an
              // undated announcement says when it was posted, small.
              (result.startsAt ? (
                <span data-testid="browse-post-when" className="text-lg font-semibold text-[var(--color-fg)]">
                  {formatCardWhen(result.startsAt)}
                </span>
              ) : (
                <span data-testid="browse-post-when" className="text-xs text-[var(--color-fg-muted)]">
                  {result.postedAt ? formatPostedDate(result.postedAt) : null}
                </span>
              ))}
            {/* #316 — outside the card's link: a chip is its own link. Signed
                out, tags are never sent (F093), so there are none. */}
            <TagChips tags={result.tags} />
          </div>
        ) : null
      }
    />
  )
}

// F093 — a Page's announcements, as a stranger sees them on Explore.
//
// One card per Page (amended 2026-09-27). One per announcement put two
// identical cards side by side, each carrying the Page's count, which read as
// broken. Shaped like `TileCard` — same image block, same title row — so it
// sits in the grid as one of the tiles rather than a text box among them.
//
// What it carries: the Page's photo and name, how many announcements this
// week, who can read them, and the ask. Not the body, the time, the place or
// the Page's location — a location line under "3 announcements" reads as
// where they happen. The body never reaches this component:
// `announcements_withheld` has no such column.

import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { Card } from '@/components/cards'
import { DefaultArt, artKindFor } from '@/components/cards/DefaultArt'
import type { BrowseResult } from '@/lib/feed/browse-feed'
import {
  WITHHELD_CTA,
  WITHHELD_DETAILS,
  withheldCountLabel,
  withheldJoinHref,
} from './withheld-copy'

export function WithheldAnnouncementCard({
  result,
  as = 'li',
}: {
  result: BrowseResult
  /** #270 — 'div' when the caller already provides the list item. */
  as?: 'li' | 'div'
}) {
  const body = (
    <>
      <div
        data-testid="tile-image"
        className="relative aspect-[3/2] w-full rounded-md overflow-hidden bg-[var(--color-surface)] flex items-center justify-center"
      >
        {result.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <DefaultArt kind={artKindFor(result.groupKind)} />
        )}
        <span
          data-testid="withheld-count"
          className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-[var(--color-fg)] shadow-sm"
        >
          <Megaphone aria-hidden className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          {withheldCountLabel(result.announcementCount ?? 0)}
        </span>
      </div>
      <div className="px-3 pt-3 pb-1">
        <p
          data-testid="tile-title"
          className="font-medium text-[15px] leading-5 text-[var(--color-fg)] line-clamp-2 min-h-[2.5rem] transition-colors group-hover/tile:text-[var(--color-accent)]"
        >
          {result.name}
        </p>
        <p
          data-testid="withheld-details"
          className="text-sm leading-5 text-[var(--color-fg-muted)] mt-1 line-clamp-3 min-h-[3.75rem]"
        >
          {WITHHELD_DETAILS}
        </p>
      </div>
    </>
  )

  return (
    <Card
      as={as}
      interactive={Boolean(result.href)}
      data-testid="withheld-card"
      className="group/tile flex flex-col [container-type:inline-size]"
    >
      {result.href ? (
        <Link data-testid="withheld-link" href={result.href} className="block">
          {body}
        </Link>
      ) : (
        body
      )}
      {/* Its own link, not the card's. Criterion 10: the ask comes first, and
          the card's link goes only to what a stranger can already read. */}
      <div className="px-3 pb-3 pt-2 mt-auto">
        <Link
          data-testid="withheld-cta"
          href={withheldJoinHref(result.href)}
          className="press inline-flex items-center rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-accent-hover)] hover:no-underline"
        >
          {WITHHELD_CTA}
        </Link>
      </div>
    </Card>
  )
}

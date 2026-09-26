// F093 — an announcement as a stranger sees it.
//
// Four things, and the scenario says exactly four: the Page name, that the
// Page posted an announcement, how many it has this period, and the ask.
// No body, no excerpt, no first line, no time, no place, no photo.
//
// NOT `TileCard`, and that is the reason. Every other browse card carries an
// image slot and a location slot, because a uniform height needs an
// always-present slot — and both of those would be a fifth and sixth thing
// here. A photo is not withheld by the ruling, but it is not one of the four
// either, and a card that quietly grows the list is how "exactly four things"
// stops being true without anyone deciding it.
//
// The body never reaches this component. `announcements_withheld` has no such
// column, which is the guarantee; this file could not render one if it tried.

import Link from 'next/link'
import { Card } from '@/components/cards'
import { METRO_WEEK_LABEL } from '@/lib/metro/metro-week'
import type { BrowseResult } from '@/lib/feed/browse-feed'

/** Where the ask goes. Signing up, not signing in — a stranger has no account
 *  yet, and `/auth/login` offers one only in small print underneath. */
const JOIN_HREF = '/auth/signup'

export function WithheldAnnouncementCard({ result }: { result: BrowseResult }) {
  const count = result.announcementCount ?? 0
  const inner = (
    <>
      <p className="text-sm font-semibold text-neutral-900">{result.name}</p>
      <p data-testid="withheld-what" className="mt-1 text-xs font-semibold text-[var(--color-accent)]">
        Posted an announcement
      </p>
      {/* A nought is not shown. "0 announcements this week" beside "posted an
          announcement" contradicts itself on the card, and the card's job is
          to say the place is alive. */}
      {count > 0 && (
        <p data-testid="withheld-count" className="mt-1 text-xs text-[var(--color-fg-muted)]">
          {count} announcement{count === 1 ? '' : 's'} {METRO_WEEK_LABEL}
        </p>
      )}
    </>
  )

  return (
    <Card as="li" interactive={Boolean(result.href)} className="flex flex-col gap-2 p-4">
      {result.href ? (
        <Link data-testid="withheld-link" href={result.href} className="hover:no-underline">
          {inner}
        </Link>
      ) : (
        <div>{inner}</div>
      )}
      {/* The ask is a link of its own rather than the card's link. Criterion
          10: nothing here navigates to something a signed-out reader cannot
          read and only then asks them to sign in — the card's own link goes to
          this announcement's WITHHELD card on the Page, and the ask is right
          here, before they go anywhere. */}
      <Link
        data-testid="withheld-cta"
        href={JOIN_HREF}
        className="press text-xs font-medium text-[var(--color-charcoal-900)] underline"
      >
        Become a member to read it
      </Link>
    </Card>
  )
}

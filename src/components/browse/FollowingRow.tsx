// T169 (#203) — F059 criterion 2b: what is this person's own, on Browse.
//
// After the Bulletins cut, following a Page has exactly one payoff and this is
// it. That is worth knowing before changing anything here: a row that quietly
// stops rendering does not look broken, it looks like nobody posted.
//
// IT HIDES WHEN EMPTY. Not an empty state, not a heading with nothing under
// it, not "no announcements yet". Absent. A signed-out reader and a member who
// follows nothing see the identical surface, which is what keeps criterion 2c
// from leaking through presentation — "you have no announcements" is still a
// statement about a person's own data.
//
// IT DECIDES NOTHING ABOUT WHO SEES WHAT. The rows are already withheld by
// `browse_feed`'s predicate before they reach the server component, let alone
// this. If this component is ever the thing keeping something private,
// something upstream has already gone wrong.
//
// THE WORD IS ANNOUNCEMENT. Never "post" — that is the internal noun and the
// column name. Never "bulletin" — that was cut. A test scans the rendered text
// for both, because this is exactly the copy a later edit smooths over.
//
// HORIZONTAL, per the 2026-09-17 amendment: "a horizontal scroll feed where
// there's additional content off to the right for more choices", the
// off-screen-right content being the point rather than a space saving. Card
// width is a clamped range rather than a fixed tile, so the next card peeks on
// a phone.

import { BrowseResultCard } from './BrowseResultCard'
import type { BrowseResult } from '@/lib/feed/browse-feed'

export function FollowingRow({ results }: { results: BrowseResult[] }) {
  if (results.length === 0) return null

  return (
    <section
      data-testid="browse-following"
      aria-label="Posts from Pages you follow"
      className="px-3 pt-4 md:px-6"
    >
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-charcoal-900)]">
        Posts from Pages you follow
      </h2>
      <ul
        // `snap-x` so a flick lands on a card rather than between two.
        className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 md:-mx-6 md:px-6"
      >
        {results.map((result) => (
          <li
            key={`${result.resultKind}:${result.resultId}`}
            className="w-[min(78vw,20rem)] shrink-0 snap-start"
          >
            <BrowseResultCard result={result} as="div" />
          </li>
        ))}
      </ul>
    </section>
  )
}

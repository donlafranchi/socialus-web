// F091 — "What's happening…", a stem each row completes: today, this week,
// this weekend. An empty row is absent (criterion 3), and the stem is absent
// when every row is (criterion 4): a heading no row finishes reads as broken.
// Horizontal, like FollowingRow: the card peeking off the right is the point.

import { BrowseResultCard } from './BrowseResultCard'
import { COPY } from '@/lib/copy'
import type { HappeningSnapshot } from '@/lib/browse/snapshot'

export function HappeningRows({ rows }: { rows: HappeningSnapshot }) {
  const present = (
    [
      [COPY.happeningToday, rows.today],
      [COPY.happeningThisWeek, rows.thisWeek],
      [COPY.happeningThisWeekend, rows.thisWeekend],
    ] as const
  ).filter(([, results]) => results.length > 0)
  if (present.length === 0) return null

  return (
    <section data-testid="browse-happening" className="px-3 pt-4 md:px-6">
      <h2 className="text-lg font-semibold text-[var(--color-charcoal-900)]">{COPY.happeningStem}</h2>
      {present.map(([label, results]) => (
        <section key={label} data-testid="happening-row" aria-label={`${COPY.happeningStem} ${label}`} className="mt-2">
          <h3 className="mb-2 text-sm font-semibold text-[var(--color-fg)]">{label}</h3>
          <ul className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 md:-mx-6 md:px-6">
            {results.map((result) => (
              <li key={`${result.resultKind}:${result.resultId}`} className="w-[min(78vw,20rem)] shrink-0 snap-start">
                <BrowseResultCard result={result} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}

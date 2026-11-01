// F091 — "What's happening…", a stem each row completes: today, this week,
// this weekend. An empty row is absent (criterion 3), and the stem is absent
// when every row is (criterion 4): a heading no row finishes reads as broken.
// Each row is a shelf (ShelfRow): one line that scrolls sideways, See all opens the rest.

import { BrowseShelves } from './BrowseShelves'
import { COPY } from '@/lib/copy'
import type { HappeningSnapshot } from '@/lib/browse/snapshot'

export function HappeningRows({ rows }: { rows: HappeningSnapshot }) {
  const groups = [
    { key: 'today', label: COPY.happeningToday, results: rows.today },
    { key: 'this-week', label: COPY.happeningThisWeek, results: rows.thisWeek },
    { key: 'this-weekend', label: COPY.happeningThisWeekend, results: rows.thisWeekend },
  ].filter((g) => g.results.length > 0)
  if (groups.length === 0) return null

  return (
    <section data-testid="browse-happening" className="px-3 pt-4 md:px-6">
      <h2 className="text-lg font-semibold text-[var(--color-charcoal-900)]">{COPY.happeningStem}</h2>
      <BrowseShelves groups={groups} />
    </section>
  )
}

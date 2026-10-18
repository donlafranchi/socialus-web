// #909 — the owner's card: what locals near this Page searched in the last 30 days, terms searched 3 or more
// times only, so no single search shows (Etsy shop stats' search terms; Shopify's searches with no results).
// Hidden when nothing reached the minimum. Owner-only: the caller renders it for the Page's managers.

import type { DemandTerm, PageSearchDemand } from '@/lib/search/page-demand'

/** Member-facing copy. Draft, pending the PM's tone look ([public-is-draft]). */
export const SEARCH_DEMAND_COPY = {
  title: 'What locals near you searched for this month',
  onlyYou: 'Only you see this. Searches made 3 or more times, never who made them.',
  fit: 'Fits your Page',
  zero: 'Found nothing nearby',
  count: (n: number) => `${n} searches`,
}

function Terms({ title, terms, testId }: { title: string; terms: DemandTerm[]; testId: string }) {
  if (terms.length === 0) return null
  return (
    <div data-testid={testId}>
      <h3 className="text-body-sm font-medium text-[var(--color-fg)]">{title}</h3>
      <ul className="mt-1 flex flex-col">
        {terms.map((t) => (
          <li key={t.query} className="flex items-baseline justify-between gap-3 py-1 text-body-sm">
            <span className="min-w-0 break-words text-[var(--color-fg)]">{t.query}</span>
            <span className="shrink-0 tabular-nums text-[var(--color-fg-muted)]">{SEARCH_DEMAND_COPY.count(t.searches)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SearchDemandCard({ demand }: { demand: PageSearchDemand | null }) {
  if (!demand || (demand.fit.length === 0 && demand.zero.length === 0)) return null
  return (
    <section
      data-testid="search-demand-card"
      aria-labelledby="search-demand-title"
      className="card flex flex-col gap-3 border border-[var(--color-border)] p-4"
    >
      <header>
        <h2 id="search-demand-title" className="text-title-3 text-[var(--color-fg)]">
          {SEARCH_DEMAND_COPY.title}
        </h2>
        <p className="mt-1 text-caption text-[var(--color-fg-muted)]">{SEARCH_DEMAND_COPY.onlyYou}</p>
      </header>
      <Terms title={SEARCH_DEMAND_COPY.fit} terms={demand.fit} testId="demand-fit" />
      <Terms title={SEARCH_DEMAND_COPY.zero} terms={demand.zero} testId="demand-zero" />
    </section>
  )
}

// #909 — what locals searched on Explore, by week (Monday, Pacific) and area: the top searches, and the top
// searches that found nothing (Shopify's "searches with no results"). Counts only; no member is stored with a search.

export interface DemandRow {
  week_start: string
  area: string
  list: 'top' | 'zero'
  query: string
  searches: number
}

function Terms({ title, rows, testId }: { title: string; rows: DemandRow[]; testId: string }) {
  return (
    <div data-testid={testId}>
      <h4 className="text-xs font-semibold text-[var(--color-fg-muted)]">{title}</h4>
      {rows.length === 0 ? (
        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">None.</p>
      ) : (
        <ol className="mt-1 flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.query} className="flex items-baseline justify-between gap-3 text-sm text-[var(--color-fg)]">
              <span className="min-w-0 break-words">{r.query}</span>
              <span className="tabular-nums text-[var(--color-fg-muted)]">{r.searches}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function SearchDemandView({ rows }: { rows: DemandRow[] }) {
  const weeks = [...new Set(rows.map((r) => r.week_start))]
  return (
    <section data-testid="search-demand" className="card p-4">
      <h2 className="text-sm font-semibold text-[var(--color-fg)]">What locals searched</h2>
      <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
        Settled Explore searches, top 10 per week and area. Found nothing means no result showed. No member is stored with a search.
      </p>
      {weeks.length === 0 ? (
        <p data-testid="demand-empty" className="mt-3 text-sm text-[var(--color-fg-muted)]">
          No searches yet.
        </p>
      ) : (
        weeks.map((w) => {
          const inWeek = rows.filter((r) => r.week_start === w)
          const areas = [...new Set(inWeek.map((r) => r.area))]
          return (
            <div key={w} data-testid="demand-week" className="mt-4">
              <h3 className="text-sm font-semibold text-[var(--color-fg)]">Week of {w}</h3>
              {areas.map((a) => {
                const here = inWeek.filter((r) => r.area === a)
                return (
                  <div key={a} className="mt-2">
                    <p className="text-xs font-medium text-[var(--color-fg)]">{a}</p>
                    <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Terms title="Top searches" rows={here.filter((r) => r.list === 'top')} testId="demand-top" />
                      <Terms title="Found nothing" rows={here.filter((r) => r.list === 'zero')} testId="demand-zero" />
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })
      )}
    </section>
  )
}

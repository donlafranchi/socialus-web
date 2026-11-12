// F121 criterion 13 — Explore's shelves, this week: impressions, tap rate, save rate and a verdict. Verdicts are
// proposals (criterion 14); Don rules on the shelf list. Counts only; no member is stored with a count.

import type { ScoreLine, Verdict } from '@/lib/shelves/verdict'

const VERDICT: Record<Verdict, string> = { 'too little data': 'Too little data', keep: 'Keep', 'move up': 'Move up', retire: 'Retire' }
const pct = (x: number) => `${(x * 100).toFixed(1)}%`

export function ShelfScoreboardView({ lines }: { lines: ScoreLine[] }) {
  const sorted = [...lines].sort((a, b) => b.saveRate - a.saveRate || b.impressions - a.impressions)
  return (
    <section data-testid="shelf-scoreboard" className="card p-4">
      <h2 className="text-sm font-semibold text-[var(--color-fg)]">Explore shelves</h2>
      <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
        Each shelf’s latest week. A verdict needs 200 impressions from 10 members over two weeks; it is a suggestion.
      </p>
      {sorted.length === 0 ? (
        <p data-testid="shelf-scoreboard-empty" className="mt-3 text-sm text-[var(--color-fg-muted)]">
          No shelf counted yet.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {sorted.map((l) => (
            <li key={l.shelfId} data-testid="shelf-score" className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-[var(--color-fg)]">
              <span data-testid="shelf-score-name" className="min-w-0 break-words font-medium">
                {l.name}
              </span>
              <span className="tabular-nums text-xs text-[var(--color-fg-muted)]">
                {l.impressions} seen · {pct(l.tapRate)} tapped · {pct(l.saveRate)} saved ·{' '}
                <span data-testid="shelf-score-verdict" className="font-semibold text-[var(--color-fg)]">
                  {VERDICT[l.verdict]}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

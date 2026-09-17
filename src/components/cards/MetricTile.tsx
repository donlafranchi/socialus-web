// The metric tile, from the recovered vendor dashboard (ccbf54d).
//
// Four parts in a fixed order: a 12px uppercase tracked label, a 24px number, a
// sparkline sharing that row and baseline-aligned right, and a 12px delta line
// beneath that turns accent when positive and grey when not.
//
// The part worth carrying everywhere: `deltaLabel` is a SENTENCE, and the
// original wrote "No activity yet" rather than "0%" when there was nothing to
// compare. Written empty states rather than numeric ones are most of what made
// the old surface read as designed, so this refuses to render a bare number —
// a caller with nothing to say passes the words for it.
//
// Fluid: the tile was already `card p-4` with no width, so it fills its grid
// cell. The sparkline is the only fixed dimension left and it is deliberately
// small and right-aligned, so it never fights the number for the row.

import { Card } from './Card'

export function MetricTile({
  label,
  value,
  deltaLabel,
  positive = true,
  points,
}: {
  label: string
  value: number | string
  /** A sentence, not a number. "No activity yet" is a valid and expected value. */
  deltaLabel: string
  positive?: boolean
  /** 0–1 values, oldest first. Omit for no sparkline. */
  points?: number[]
}) {
  const tone = positive ? 'text-[var(--color-accent)]' : 'text-neutral-500'

  return (
    <Card as="li" data-testid="metric-tile" className="p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold text-neutral-900">{value}</p>
        {points && points.length > 1 ? (
          <Sparkline points={points} className={positive ? 'text-[var(--color-accent)]' : 'text-neutral-400'} />
        ) : null}
      </div>
      <p className={`text-xs mt-1 ${tone}`}>{deltaLabel}</p>
    </Card>
  )
}

function Sparkline({ points, className }: { points: number[]; className?: string }) {
  const max = Math.max(...points, 1)
  const step = 48 / (points.length - 1)
  const d = points.map((p, i) => `${i * step},${14 - (p / max) * 12}`).join(' ')
  return (
    <svg viewBox="0 0 48 16" className={`w-12 h-4 shrink-0 ${className ?? ''}`} aria-hidden>
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

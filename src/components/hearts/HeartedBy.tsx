// #1171 (plan #269, option A, Don 2026-11-02) — who hearted, for the poster: "Ana and 4 others hearted this", newest
// first; a tap opens the list. Anyone else gets a tally only when public counts are on (the database's
// heart_counts_public, off for now: counts are open for review), and then sees the number, never names.

import { Heart } from 'lucide-react'
import { HEART_COPY } from '@/lib/copy'
import type { HeartTally } from '@/lib/hearts/heart-view'

export function HeartedBy({ tally, testId = 'hearted-by' }: { tally: HeartTally | undefined; testId?: string }) {
  if (!tally || tally.count === 0) return null
  if (!tally.names) {
    return (
      <p data-testid={testId} className="flex items-center gap-1 text-caption text-[var(--color-fg-muted)]">
        <Heart size={14} aria-hidden="true" />
        <span>{tally.count}</span>
      </p>
    )
  }
  return (
    <details data-testid={testId} className="text-caption text-[var(--color-fg-muted)]">
      <summary className="press inline-flex min-h-tap cursor-pointer list-none items-center gap-1">
        <Heart size={14} aria-hidden="true" />
        {HEART_COPY.heartedBy(tally.names, tally.count)}
      </summary>
      <ul aria-label={HEART_COPY.heartedByList} className="mb-1 flex flex-col gap-1 pl-5">
        {tally.names.map((n, i) => (
          <li key={`${n}-${i}`}>{n}</li>
        ))}
      </ul>
    </details>
  )
}

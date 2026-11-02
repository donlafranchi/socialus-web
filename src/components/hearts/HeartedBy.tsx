// #1171 (plan #269, option A, Don 2026-11-02) — who hearted, for the poster: "Ana and 4 others hearted this", newest
// first; a tap opens the list. Everyone else sees nothing, unless public counts are switched on (PUBLIC_HEART_COUNT).

import { Heart } from 'lucide-react'
import { HEART_COPY } from '@/lib/copy'
import { PUBLIC_HEART_COUNT } from '@/lib/features'
import type { HeartTally } from '@/lib/hearts/heart-view'

export function HeartedBy({ tally, testId = 'hearted-by', publicCount = PUBLIC_HEART_COUNT }: { tally: HeartTally | undefined; testId?: string; publicCount?: boolean }) {
  if (!tally || tally.count === 0) return null
  if (!tally.names) {
    if (!publicCount) return null
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

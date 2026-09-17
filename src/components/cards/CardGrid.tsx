// The reflowing grid. This is the part the recovered design did not have.
//
// `VendorCard` was `flex-shrink-0 w-56` inside a horizontal scroller: a fixed
// 224px tile that never reflows, which is why it cannot satisfy "27-inch monitor
// down to an iPhone mini". Replaced rather than patched with a breakpoint —
// breakpoints pick winners at three widths and are wrong at every other one.
//
// `repeat(auto-fill, minmax(min(100%, 15rem), 1fr))` does the whole job:
//
//   · `min(100%, 15rem)` — the floor is 240px OR the full container, whichever
//     is smaller. That `min()` is what stops a 240px minimum overflowing a
//     ~288px-of-usable-width iPhone mini: below 240px the card simply becomes
//     the container.
//   · `auto-fill` + `1fr` — columns are added as width allows and share the
//     remainder, so a 2560px monitor gets ~10 columns of ~250px rather than
//     three enormous ones or a 2560px-wide card.
//
// The result is one rule with no media queries that holds at both extremes and
// every width between.

import type { ReactNode } from 'react'

export type CardGridDensity = 'comfortable' | 'compact'

const MIN: Record<CardGridDensity, string> = {
  // Matches the recovered card's two widths: w-56 (224px) and w-44 (176px).
  comfortable: '14rem',
  compact: '11rem',
}

export function CardGrid({
  density = 'comfortable',
  className = '',
  children,
}: {
  density?: CardGridDensity
  className?: string
  children: ReactNode
}) {
  return (
    <ul
      data-testid="card-grid"
      data-density={density}
      className={`grid gap-4 list-none p-0 m-0 ${className}`.trim()}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${MIN[density]}), 1fr))`,
      }}
    >
      {children}
    </ul>
  )
}

// The card shell, lifted verbatim from what `.card` / `.card-hover` already do
// in globals.css and given a name.
//
// Source of truth for the look is the recovered `VendorCard` at ccbf54d, read
// directly — not a re-description of it. What that card does and this keeps:
//
//   · white on the warm off-white page (#f7f6f2). No border, ever — the
//     separation is the colour difference plus a shadow that only exists on
//     hover. A border here flattens the whole surface.
//   · rounded-xl, overflow-hidden, 200ms ease-out
//   · hover: a 12% shadow and a 2px lift, together. Either alone reads wrong —
//     the shadow without the lift looks like a glow, the lift without the
//     shadow looks like a glitch.

import type { ReactNode } from 'react'

export function Card({
  as: Tag = 'div',
  interactive = false,
  className = '',
  children,
  ...rest
}: {
  as?: 'div' | 'article' | 'section' | 'li'
  /** Hover shadow + lift. Only for a card that is actually a link or a button. */
  interactive?: boolean
  className?: string
  children: ReactNode
} & Record<string, unknown>) {
  return (
    <Tag className={`card ${interactive ? 'card-hover' : ''} ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  )
}

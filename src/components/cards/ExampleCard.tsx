'use client'

// A card that shows the SHAPE of the idea without claiming a Page exists.
//
// Ruled by Don, 2026-09-17: sample cards carry a mark. The reasoning worth not
// relitigating is why the mark alone is not enough — **a stranger scrolling
// reads shapes, not badges.** Someone skimming a screen registers "cards of
// local businesses" long before they read any label on one, and by then they
// have already formed a belief about how much is here. So the weight is carried
// by two things the eye cannot miss and the pointer cannot get past:
//
//   1. SEPARATION — never in the same grid or scroll region as real results.
//      Its own bounded block, its own heading. See ExampleBlock.
//   2. NON-INTERACTIVITY — nothing here behaves like a real Page. No href, no
//      follow or support control, no map pin. A card that cannot be opened is
//      a card that cannot be mistaken for stock, whatever the label says.
//
// The mark and the tint are the third line of defence, not the first.
//
// Deliberately NOT built on TileCard. TileCard's job is to render a real thing
// and it takes `href` and `action` — reusing it here would mean an example card
// is one prop away from being interactive, and that prop would eventually get
// passed. Sharing the look without sharing the affordances is the point.

import { Card } from './Card'
import { locationLine, type CardLocation } from './location'

export interface ExampleCardProps {
  title: string
  tagline: string
  /** The real metro under discussion — see ExampleBlock for why. */
  location: CardLocation
  emoji: string
}

export function ExampleCard({ title, tagline, location, emoji }: ExampleCardProps) {
  return (
    <Card
      as="li"
      // `interactive` is never passed: no lift, because nothing here responds.
      data-testid="example-card"
      aria-hidden={false}
      className="relative flex flex-col [container-type:inline-size] ring-1 ring-[var(--color-border)]"
      // Inline, not a class: `.card` applies `bg-white` and wins the cascade
      // against a utility at the same specificity. The tint is load-bearing —
      // an example card on the same white as a real one is the one difference
      // a glance would not catch — so it is set where nothing can quietly
      // override it. Verified in the browser, where the class version came back
      // rgb(255,255,255).
      style={{ backgroundColor: 'var(--color-surface)' }}
    >
      {/* Persistent. Not a hover reveal, not a corner sticker that scrolls out
          of the image — it sits on the image block, which is the first thing
          the eye lands on. */}
      <span
        data-testid="example-mark"
        className="absolute left-2 top-2 z-10 rounded-full bg-[var(--color-fg)]/80 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white"
      >
        Example
      </span>

      <div
        data-testid="example-image"
        className="aspect-[3/2] w-full overflow-hidden rounded-xl bg-white/70 flex items-center justify-center"
        style={{ fontSize: 'clamp(2rem, 17cqw, 4rem)' }}
      >
        <span aria-hidden>{emoji}</span>
      </div>

      {/* The same reserved rows as a real tile, so the shape reads true. */}
      <div className="px-3 pt-3 pb-3">
        <p className="font-medium text-[15px] leading-5 text-[var(--color-fg)] line-clamp-2 min-h-[2.5rem]">
          {title}
        </p>
        <p className="text-sm leading-5 text-[var(--color-fg-muted)] mt-1 line-clamp-2 min-h-[2.5rem]">
          {tagline}
        </p>
        <p className="text-sm leading-5 text-[var(--color-fg)] mt-2 font-medium line-clamp-1 min-h-[1.25rem]">
          {locationLine(location)}
        </p>
      </div>
    </Card>
  )
}

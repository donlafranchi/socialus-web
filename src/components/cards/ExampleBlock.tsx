'use client'

// The bounded block that example cards live in, and the reason they are safe.
//
// Ruled by Don, 2026-09-17. Three rules, and each answers a specific way a
// reasonable person would otherwise be misled:
//
//   · ITS OWN BLOCK, never the results grid. A stranger scrolling reads shapes,
//     not badges — examples sharing a scroll region with real results are read
//     as more results, however they are labelled. This renders its own <section>
//     with its own heading and its own grid, and callers place it outside the
//     results region.
//
//   · CAPTIONED AS AN ILLUSTRATION OF THE IDEA, not a sample of stock. A set of
//     cards spanning categories reads as a claim about what is available here.
//     The caption has to say "this is the kind of thing" rather than "here are
//     some" — those are different sentences and only one of them is true.
//
//   · NEVER RETURNED BY SEARCH, NEVER PAGINATED INTO. Nothing here comes from a
//     query, so there is nothing for a query to return. That is enforced by
//     construction: EXAMPLES is a module constant, not a fetch.
//
// The business names are deliberately not plausible local firms. A plausible
// name is indistinguishable from a real listing at a glance and, worse, could
// collide with an actual business. The place names ARE the real metro under
// discussion, because the point is "in your area" and a fake city would make
// the whole block read as decoration from somewhere else.

import { CardGrid } from './CardGrid'
import { ExampleCard } from './ExampleCard'
import type { CardLocation } from './location'

interface Example {
  title: string
  tagline: string
  emoji: string
  /** Set by the block from the metro being discussed. */
  scale: CardLocation['scale']
}

// Obviously illustrative. "The Example Bakery" cannot be mistaken for a firm;
// "Sunrise Bakehouse" could be, and might already exist somewhere.
const EXAMPLES: readonly Example[] = [
  { title: 'The Example Bakery', tagline: 'Bread, pastries, and a Saturday morning queue.', emoji: '🥖', scale: 'address' },
  { title: 'A Sample Repair Shop', tagline: 'Bikes fixed while you wait.', emoji: '🔧', scale: 'neighbourhood' },
  { title: 'An Illustrative Run Club', tagline: 'Tuesday evenings, all paces.', emoji: '👟', scale: 'neighbourhood' },
  { title: 'Example Pottery Studio', tagline: 'Classes, and shelves of other people’s mugs.', emoji: '🏺', scale: 'address' },
] as const

export function ExampleBlock({ placeName }: { placeName: string }) {
  return (
    <section
      data-testid="example-block"
      aria-labelledby="example-block-heading"
      className="rounded-lg border border-dashed border-[var(--color-border)] bg-white/40 p-4"
    >
      <h3 id="example-block-heading" className="text-sm font-semibold text-[var(--color-fg)]">
        What SocialUs looks like
      </h3>
      {/* The caption does the load-bearing work. "The kind of thing" is a claim
          about the idea; "some of what's here" would be a claim about stock. */}
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        These are made up, to show the kind of thing people put on SocialUs. Nothing here is a real
        Page in {placeName}.
      </p>

      <CardGrid density="compact" className="mt-4">
        {EXAMPLES.map((e) => (
          <ExampleCard
            key={e.title}
            title={e.title}
            tagline={e.tagline}
            emoji={e.emoji}
            location={{ scale: e.scale, label: placeName }}
          />
        ))}
      </CardGrid>
    </section>
  )
}

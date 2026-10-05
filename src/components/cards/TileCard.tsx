// The tile. The recovered `VendorCard` (ccbf54d) made fluid, then made uniform.
//
// Kept from the original: the image block with its own rounded-md inside the
// card's, the emoji empty state on the surface colour, the 15px medium name,
// the 14px muted tagline, the action below the text outside the link.
//
// Changed for Don's review of the gallery, 2026-09-17:
//
//   1. UNIFORM HEIGHT. Every text row now reserves its space whether or not it
//      has content — two lines for the title, two for the tagline, one for the
//      location. Content no longer decides height: a one-word title and a
//      wrapping one produce the same card. Reserving beats stretching, because
//      `align-items: stretch` only equalises within a row and Don wants every
//      card the same.
//   2. LOCATION IS REQUIRED. Not an optional line — the slot that is always
//      there is what makes the height deterministic, and `online` is a value
//      rather than an absence. See location.ts; the vocabulary is ratified.
//   3. LEFT PADDING. The original's text was flush to the card edge; the image
//      bleeds, so nothing revealed it. `px-3` on the text block. The image
//      still bleeds, which is deliberate — an inset image inside an inset text
//      block reads as a card inside a card.
//   4. NO UNDERLINE. The global `a:hover` underlined the whole card, image
//      included. Removed for cards in globals.css. The affordance it carried is
//      replaced by the lift plus the title shifting to the accent colour —
//      colour and motion rather than a line.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Card } from './Card'
import { locationLine, type CardLocation } from './location'

export interface TileCardProps {
  title: string
  /** Page kinds (dispatch, 2026-10-05) — Business, Group or Organization, under the name. */
  kindLine?: string
  /** Optional. Reserves two lines whether present or not. */
  tagline?: string | null
  /** Required. Every card has a location — see location.ts. */
  location: CardLocation
  imageUrl?: string | null
  emoji?: string
  /** #299 — shown when there is no photo, in place of the emoji. */
  art?: ReactNode
  href?: string | null
  action?: ReactNode
  /** #260 — what the image is, in the card's own words. Empty means decorative. */
  imageAlt?: string
  /** #270 — 'div' when the caller already provides the list item. */
  as?: 'li' | 'div'
}

export function TileCard({
  title,
  kindLine,
  tagline,
  location,
  imageUrl,
  emoji = '🌱',
  art,
  href,
  action,
  imageAlt = '',
  as = 'li',
}: TileCardProps) {
  const body = (
    <>
      <div
        data-testid="tile-image"
        className="aspect-[3/2] w-full rounded-md overflow-hidden bg-[var(--color-surface)] flex items-center justify-center"
        style={{ fontSize: 'clamp(2rem, 17cqw, 4rem)' }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={imageAlt} className="h-full w-full object-cover" />
        ) : art ? (
          art
        ) : (
          <span data-testid="tile-emoji" aria-hidden>
            {emoji}
          </span>
        )}
      </div>

      {/* Every row below reserves its height. `min-h` in em rather than a pixel
          count so it tracks the line-height of its own row rather than a
          number that drifts when the type scale changes. */}
      <div data-testid="tile-text" className="px-3 pt-3 pb-1">
        <p
          data-testid="tile-title"
          className="font-medium text-[15px] leading-5 text-[var(--color-fg)] line-clamp-2 min-h-[2.5rem] transition-colors group-hover/tile:text-[var(--color-accent)]"
        >
          {title}
        </p>
        {kindLine && (
          <p data-testid="tile-kind" className="text-caption leading-5 text-[var(--color-fg-muted)] line-clamp-1">
            {kindLine}
          </p>
        )}
        <p
          data-testid="tile-tagline"
          className="text-sm leading-5 text-[var(--color-fg-muted)] mt-1 line-clamp-2 min-h-[2.5rem]"
        >
          {tagline ?? ' '}
        </p>
        <p
          data-testid="tile-location"
          className="text-sm leading-5 text-[var(--color-fg)] mt-2 font-medium line-clamp-1 min-h-[1.25rem]"
        >
          {locationLine(location)}
        </p>
      </div>
    </>
  )

  return (
    <Card
      as={as}
      interactive={Boolean(href)}
      data-testid="tile-card"
      data-location-scale={location.scale}
      // `group/tile` so the title can respond to hovering anywhere on the card,
      // not only on the words. container-type sizes the emoji off the CARD.
      className="group/tile flex flex-col [container-type:inline-size]"
    >
      {href ? (
        <Link href={href} className="block">
          {body}
        </Link>
      ) : (
        body
      )}
      {action ? <div className="px-3 pb-3 pt-2 mt-auto">{action}</div> : null}
    </Card>
  )
}

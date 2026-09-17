// The tile. The recovered `VendorCard` (ccbf54d) made fluid.
//
// Kept exactly as it was:
//   · image block on top with its OWN rounded-xl inside the card's — the inner
//     radius is what stops it reading as a photo with a card stuck behind it
//   · the emoji empty state on the surface colour, never a grey box
//   · font-medium 15px name clamped to one line; 14px muted tagline clamped to
//     two; a 14px medium meta line under them
//   · the action sits outside the link, below the text block
//
// Changed, because the fixed tile cannot meet "27-inch down to iPhone mini":
//   · `w-56` / `w-44` are gone. The card fills its grid cell; CardGrid decides
//     how many cells there are.
//   · the image is `aspect-[3/2]` rather than `h-32`. A fixed height on a card
//     that now varies in width distorts the crop at both extremes — tall and
//     letterboxed when narrow, a thin strip when wide. A ratio holds the
//     composition at every width, which is what makes the emoji state keep
//     identical height across a row.
//   · the emoji scales with the card (`clamp` on container-query units)
//     instead of a fixed `text-3xl`. The original's 30px inside a 128px-tall
//     block is roughly a quarter of the block's height; 17cqw holds that same
//     proportion at every card width, so it is neither a speck on a wide card
//     nor overwhelming on a narrow one.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Card } from './Card'

export interface TileCardProps {
  title: string
  /** Optional second line. Clamped to two lines, as the original was. */
  tagline?: string | null
  /** Optional third line — the original used "Market · Sunday". */
  meta?: string | null
  imageUrl?: string | null
  /** Shown centred on the surface colour when there is no image. */
  emoji?: string
  href?: string | null
  /** Rendered under the text block, outside the link. */
  action?: ReactNode
}

export function TileCard({
  title,
  tagline,
  meta,
  imageUrl,
  emoji = '🌱',
  href,
  action,
}: TileCardProps) {
  const body = (
    <>
      <div
        data-testid="tile-image"
        className="aspect-[3/2] w-full rounded-xl overflow-hidden bg-[var(--color-surface)] flex items-center justify-center"
        style={{ fontSize: 'clamp(2rem, 17cqw, 4rem)' }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span data-testid="tile-emoji" aria-hidden>
            {emoji}
          </span>
        )}
      </div>
      <div className="pt-3 pb-1">
        <p className="font-medium text-[15px] text-[var(--color-fg)] line-clamp-1">{title}</p>
        {tagline ? (
          <p className="text-sm text-[var(--color-fg-muted)] mt-1 line-clamp-2">{tagline}</p>
        ) : null}
        {meta ? <p className="text-sm text-[var(--color-fg)] mt-2 font-medium">{meta}</p> : null}
      </div>
    </>
  )

  return (
    <Card
      as="li"
      interactive={Boolean(href)}
      data-testid="tile-card"
      // container-type is what lets the emoji size off the CARD rather than the
      // viewport — the same tile is 288px on a phone and 250px in a ten-column
      // grid, and a viewport unit cannot tell those apart.
      className="[container-type:inline-size]"
    >
      {href ? (
        <Link href={href} className="block hover:no-underline">
          {body}
        </Link>
      ) : (
        body
      )}
      {action ? <div className="pt-2">{action}</div> : null}
    </Card>
  )
}

'use client'

// "Your Pages" — the thing that was missing.
//
// Uses the card system rather than inventing another card: CardGrid + TileCard,
// so this surface reflows from an iPhone mini to a 27-inch monitor and every
// card is the same height, for free.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { CardGrid, TileCard } from '@/components/cards'
import { getOwnPages, type OwnPage } from '@/lib/member/own-pages'

export function OwnPages({ memberId }: { memberId: string }) {
  const [pages, setPages] = useState<OwnPage[] | null>(null)

  useEffect(() => {
    let live = true
    getOwnPages(createClient(), memberId).then((p) => {
      if (live) setPages(p)
    })
    return () => {
      live = false
    }
  }, [memberId])

  if (pages === null) {
    return (
      <p className="text-sm text-[var(--color-fg-muted)]" data-testid="own-pages-loading">
        Loading your Pages…
      </p>
    )
  }

  if (pages.length === 0) {
    return (
      <p className="text-sm text-[var(--color-fg-muted)]" data-testid="own-pages-empty">
        You haven&apos;t made a Page yet. Tap Create to start one.
      </p>
    )
  }

  return (
    <CardGrid data-testid="own-pages">
      {pages.map((p) => (
        <TileCard
          key={p.groupId}
          title={p.name}
          tagline={p.description}
          location={p.location}
          imageUrl={p.photoUrl}
          href={p.href}
          // A draft looks identical to a live Page otherwise, and the
          // difference is the whole question its author is asking.
          action={
            p.lifecycleState === 'draft' ? (
              <span
                data-testid="own-page-draft"
                className="text-xs uppercase tracking-wide font-semibold text-[var(--color-fg-muted)]"
              >
                Draft — not yet public
              </span>
            ) : (
              <span
                data-testid="own-page-live"
                className="text-xs uppercase tracking-wide font-semibold text-[var(--color-accent)]"
              >
                Live
              </span>
            )
          }
        />
      ))}
    </CardGrid>
  )
}

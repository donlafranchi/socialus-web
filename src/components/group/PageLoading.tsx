'use client'

// #555 — the Page's loading boundary (loading.tsx): on screen the moment a card is tapped, before the server has
// found the Page. With what the card handed over it shows the Page's own name, kind and photo (an optimistic
// render); without it, the plain outline. The rest of the Page streams in behind it (#537).

import { useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { readCardForPage, type CardHandoff } from '@/lib/browse/card-handoff'
import { PageSkeleton } from './PageSkeleton'

const nothing = () => () => {}

export function PageLoading() {
  const path = usePathname()
  // The server and the first client render agree on "no handoff"; the card's data is read once hydrated.
  const card = useSyncExternalStore<CardHandoff | null>(nothing, () => readCardForPage(path), () => null)
  if (!card) return <PageSkeleton />
  return (
    <main className="pb-nav" aria-busy="true">
      <p role="status" className="sr-only">
        Loading this Page
      </p>
      <div className="motion-safe:animate-pulse">
        <div className="relative aspect-[8/3] w-full overflow-hidden bg-[var(--color-surface)]">
          {/* The same address the card already loaded, so the browser has it. */}
          {card.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.imageUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
      </div>
      <div className="gutter py-4">
        <h1 className="text-title-1 text-[var(--color-fg)]">{card.name}</h1>
        {card.kindLine && <p className="mt-1 text-body-sm text-[var(--color-fg-muted)]">{card.kindLine}</p>}
        <div className="motion-safe:animate-pulse">
          <div className="mt-6 h-4 w-full rounded-sm bg-[var(--color-surface)]" />
          <div className="mt-2 h-4 w-5/6 rounded-sm bg-[var(--color-surface)]" />
          <div className="mt-2 h-4 w-3/4 rounded-sm bg-[var(--color-surface)]" />
        </div>
      </div>
    </main>
  )
}

'use client'

// "Your Pages" — the thing that was missing.
//
// Uses the card system rather than inventing another card: CardGrid + TileCard,
// so this surface reflows from an iPhone mini to a 27-inch monitor and every
// card is the same height, for free.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { CardGrid, TileCard } from '@/components/cards'
import { Button } from '@/components/ui/Button'
import { getOwnPages, type OwnPage } from '@/lib/member/own-pages'
import { formatRemovalDate } from '@/lib/groups/page-removal'
import { restorePageAction, type PageLifecycleResult } from '@/app/_actions/page-lifecycle-actions'

const STATE = 'text-xs uppercase tracking-wide font-semibold text-[var(--color-fg-muted)]'

export function OwnPages({
  memberId,
  onRestore = restorePageAction,
}: {
  memberId: string
  onRestore?: (i: { groupId: string }) => Promise<PageLifecycleResult>
}) {
  const router = useRouter()
  const [pages, setPages] = useState<OwnPage[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ groupId: string; message: string } | null>(null)

  useEffect(() => {
    let live = true
    getOwnPages(createClient(), memberId).then((p) => {
      if (live) setPages(p)
    })
    return () => {
      live = false
    }
  }, [memberId])

  // #423 — an archived or deleted Page comes back from here.
  async function restore(groupId: string) {
    setBusy(groupId)
    setError(null)
    const r = await onRestore({ groupId })
    if (!r.ok) {
      setBusy(null)
      return setError({ groupId, message: r.message })
    }
    setPages(await getOwnPages(createClient(), memberId))
    setBusy(null)
    router.refresh()
  }

  // Copy is a placeholder ([public-is-draft]).
  function hiddenState(p: OwnPage) {
    const label =
      p.lifecycleState === 'archived' ? (
        <span data-testid="own-page-archived" className={STATE}>
          Archived · only you can see it
        </span>
      ) : (
        <span data-testid="own-page-deleted" className={STATE}>
          Deleted · removed {p.deleteAfter ? formatRemovalDate(p.deleteAfter) : ''}
        </span>
      )
    return (
      <div className="flex flex-col items-start gap-2">
        {label}
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Restore ${p.name}`}
          disabled={busy === p.groupId}
          onClick={() => restore(p.groupId)}
        >
          Restore
        </Button>
        {error?.groupId === p.groupId && (
          <p role="alert" className="text-caption text-red-700">
            {error.message}
          </p>
        )}
      </div>
    )
  }

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
            p.lifecycleState === 'archived' || p.lifecycleState === 'dissolved' ? (
              hiddenState(p)
            ) : p.lifecycleState === 'draft' ? (
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

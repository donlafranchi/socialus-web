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
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { getOwnPages, type OwnPage } from '@/lib/member/own-pages'
import { formatRemovalDate } from '@/lib/groups/page-removal'
import { restorePageAction, discardDraftAction, type PageLifecycleResult } from '@/app/_actions/page-lifecycle-actions'

const STATE = 'text-xs uppercase tracking-wide font-semibold text-[var(--color-fg-muted)]'

export function OwnPages({
  memberId,
  onRestore = restorePageAction,
  onDiscard = discardDraftAction,
}: {
  memberId: string
  onRestore?: (i: { groupId: string }) => Promise<PageLifecycleResult>
  /** #463 — delete an unpublished draft. */
  onDiscard?: (i: { groupId: string }) => Promise<PageLifecycleResult>
}) {
  const router = useRouter()
  const [pages, setPages] = useState<OwnPage[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ groupId: string; message: string } | null>(null)
  const [discarding, setDiscarding] = useState<OwnPage | null>(null)

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

  // #463 — a draft reached nobody, so Delete is final; the sheet says so.
  async function discard(p: OwnPage) {
    setBusy(p.groupId)
    setError(null)
    const r = await onDiscard({ groupId: p.groupId })
    setBusy(null)
    if (!r.ok) {
      setDiscarding(null)
      return setError({ groupId: p.groupId, message: r.message })
    }
    setDiscarding(null)
    setPages(await getOwnPages(createClient(), memberId))
    router.refresh()
  }

  // Copy is a placeholder ([public-is-draft]).
  function hiddenState(p: OwnPage) {
    const label =
      p.lifecycleState === 'archived' ? (
        <span data-testid="own-page-archived" className={STATE}>
          Archived · Only you can see this
        </span>
      ) : (
        <span data-testid="own-page-deleted" className={STATE}>
          Deleted · restore until {p.deleteAfter ? formatRemovalDate(p.deleteAfter) : ''}
        </span>
      )
    return (
      <div className="flex flex-col items-start gap-2">
        {label}
        <Button
          variant="secondary"
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

  const drafts = pages.filter((p) => p.lifecycleState === 'draft')
  const rest = pages.filter((p) => p.lifecycleState !== 'draft')

  return (
    <>
      {rest.length > 0 && (
        <div data-testid="own-pages">
          <CardGrid>
            {rest.map((p) => (
              <TileCard
                key={p.groupId}
                title={p.name}
                tagline={p.description}
                location={p.location}
                imageUrl={p.photoUrl}
                href={p.href}
                action={
                  p.lifecycleState === 'archived' || p.lifecycleState === 'dissolved' ? (
                    hiddenState(p)
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
        </div>
      )}

      {/* #463 — what Create started and never published. Copy is a placeholder ([public-is-draft]). */}
      {drafts.length > 0 && (
        <section data-testid="own-drafts" className={rest.length > 0 ? 'mt-8' : undefined}>
          <h3 className="mb-3 text-title-3 text-[var(--color-fg)]">Unfinished Pages</h3>
          <CardGrid>
            {drafts.map((p) => (
              <TileCard
                key={p.groupId}
                title={p.name}
                tagline={p.description}
                location={p.location}
                imageUrl={p.photoUrl}
                href={p.href}
                action={
                  <div className="flex flex-col items-start gap-1">
                    <span
                      data-testid="own-page-draft"
                      className="text-xs uppercase tracking-wide font-semibold text-[var(--color-fg-muted)]"
                    >
                      Not yet public
                    </span>
                    <div className="flex w-full items-center justify-between gap-2">
                      {p.href && (
                        <Link
                          href={p.href}
                          aria-label={`Continue ${p.name}`}
                          className="press inline-flex min-h-tap items-center text-body-sm font-medium text-[var(--color-charcoal-900)] underline"
                        >
                          Continue
                        </Link>
                      )}
                      <button
                        type="button"
                        aria-label={`Delete ${p.name}`}
                        disabled={busy === p.groupId}
                        onClick={() => {
                          setError(null)
                          setDiscarding(p)
                        }}
                        className="press inline-flex min-h-tap items-center text-body-sm text-[var(--color-fg-muted)] underline"
                      >
                        Delete
                      </button>
                    </div>
                    {error?.groupId === p.groupId && (
                      <p role="alert" className="text-caption text-red-700">
                        {error.message}
                      </p>
                    )}
                  </div>
                }
              />
            ))}
          </CardGrid>
        </section>
      )}

      <Sheet
        open={discarding !== null}
        title="Delete this unfinished Page?"
        description={discarding ? `“${discarding.name}” was never public. It’s gone for good.` : undefined}
        onClose={() => setDiscarding(null)}
        testId="discard-draft-sheet"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => discarding && discard(discarding)}
              className="btn-primary"
            >
              Delete Page
            </button>
            <button type="button" onClick={() => setDiscarding(null)} className="btn-secondary">
              Keep it
            </button>
          </div>
        }
      >
        <></>
      </Sheet>
    </>
  )
}

'use client'

// Choosing which metro Browse is showing.
//
// It sits at the TOP of the page, behind the location pill — an active scope
// control is a property of the surface you are reading, not a footer link. A
// city list in a footer is a different thing: finding somewhere else. This is
// the control for where you are now.
//
// The two groups are the honest part. Exactly one metro is open today and 296
// exist; a flat list of 296 as equals would imply we cover all of them. So the
// ones we actually serve come first under their own heading, and the rest are
// named as what they are.
//
// And the rest are not selectable AS A SCOPE. 295 of the 296 carry no polygon
// and no centroid (the waitlist migration dropped both NOT NULLs), so choosing
// one as a place to browse could only relabel the page while the results
// underneath stayed exactly the same — the precise lie this whole change set is
// undoing.
//
// They ARE tappable now, and they open MetroNotCoveredPanel instead: what is
// missing, what SocialUs looks like, and the waitlist that already exists.
// Listing them as dead text was honest about scope and told someone who found
// their own city nothing at all.

// T156 — the list arrives as a prop. It used to fetch itself from the browser
// on first open, which meant the one control that decides what Browse shows
// resolved its options on a different client from the results. Browse resolves
// the metro server-side now; the options come from the same read
// (`listFeedMetros`), through the surface, so the picker and the feed can
// never disagree about which metros exist.

import { useEffect, useState } from 'react'
import { splitByOpen, type FeedMetro } from '@/lib/feed/feed-metro'
import { MetroNotCoveredPanel } from './MetroNotCoveredPanel'
import { Sheet } from '@/components/ui/Sheet'

export interface AreaOption {
  id: string
  name: string
}

export function AreaPicker({
  open,
  currentSlug,
  metros,
  onClose,
  onChoose,
  onSearchAreas,
  currentAreaId = null,
  onChooseArea,
  onClearArea,
}: {
  open: boolean
  currentSlug: string | null
  metros: readonly FeedMetro[]
  onClose: () => void
  onChoose: (metro: FeedMetro) => void
  /** #476 — type-to-search neighbourhoods in the current metro. Absent when there are none. */
  onSearchAreas?: (query: string) => Promise<AreaOption[]>
  currentAreaId?: string | null
  onChooseArea?: (area: AreaOption) => void
  onClearArea?: () => void
}) {
  const [q, setQ] = useState('')
  // A metro the platform does not serve, opened for a closer look. Not a scope.
  const [looking, setLooking] = useState<FeedMetro | null>(null)
  const [areas, setAreas] = useState<AreaOption[]>([])
  // Stale answers for a cleared box never show.
  const shownAreas = q.trim() && onSearchAreas ? areas : []
  const currentName = metros.find((m) => m.slug === currentSlug)?.name ?? 'this metro'

  // Debounced, and a slow earlier answer never overwrites a newer one.
  useEffect(() => {
    const term = q.trim()
    if (!onSearchAreas || !term) return
    let live = true
    const id = setTimeout(() => {
      onSearchAreas(term)
        .then((found) => live && setAreas(found))
        .catch(() => live && setAreas([]))
    }, 200)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [q, onSearchAreas])

  const all = metros
  const needle = q.trim().toLowerCase()
  const matching = needle ? all.filter((m) => m.name.toLowerCase().includes(needle)) : all
  const { open: served, notYet } = splitByOpen(matching)

  const openRow = (m: FeedMetro) => (
    <li key={m.id}>
      <button
        type="button"
        data-testid={`scope-metro-${m.slug}`}
        data-current={m.slug === currentSlug ? 'true' : undefined}
        onClick={() => onChoose(m)}
        className="nudge flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface)]"
      >
        <span className="truncate">{m.name}</span>
        {m.slug === currentSlug ? (
          <span className="text-xs font-medium text-[var(--color-accent)]">Showing</span>
        ) : null}
      </button>
    </li>
  )

  // Tappable, but it opens the not-covered panel — it never becomes the scope.
  // `data-selectable="false"` still says so: a test asserting you cannot browse
  // here should keep passing.
  const notYetRow = (m: FeedMetro) => (
    <li key={m.id}>
      <button
        type="button"
        data-testid={`scope-metro-${m.slug}`}
        data-selectable="false"
        onClick={() => setLooking(m)}
        className="nudge flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)]"
      >
        <span className="truncate">{m.name}</span>
        <span className="shrink-0 text-xs">Not yet →</span>
      </button>
    </li>
  )

  // #297 — L03, on the shared sheet.
  return (
    <Sheet open={open} title="Choose your area" onClose={onClose} testId="scope-sheet">
      <div>
        {looking ? (
          <MetroNotCoveredPanel metro={looking} onBack={() => setLooking(null)} />
        ) : (
        <>
        <input
          type="search"
          data-testid="scope-search"
          aria-label="Search areas"
          placeholder="Search areas"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input mt-3 w-full"
        />

        {currentAreaId && onClearArea ? (
          <button
            type="button"
            data-testid="scope-area-clear"
            onClick={onClearArea}
            className="nudge mt-3 flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-[var(--color-surface)]"
          >
            All of {currentName}
          </button>
        ) : null}

        {shownAreas.length > 0 && onChooseArea ? (
          <>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Neighbourhoods in {currentName}
            </h3>
            <ul className="mt-1" data-testid="scope-areas">
              {shownAreas.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    data-testid={`scope-area-${a.id}`}
                    data-current={a.id === currentAreaId ? 'true' : undefined}
                    onClick={() => onChooseArea(a)}
                    className="nudge flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface)]"
                  >
                    <span className="truncate">{a.name}</span>
                    {a.id === currentAreaId ? (
                      <span className="text-xs font-medium text-[var(--color-accent)]">Showing</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Where SocialUs is running
            </h3>
            {served.length > 0 ? (
              <ul className="mt-1" data-testid="scope-open-list">{served.map(openRow)}</ul>
            ) : (
              <p className="mt-1 text-sm text-[var(--color-fg-muted)]">Nothing matching yet.</p>
            )}

            {/* Named for what they are, and not tappable — see the note at the
                top of this file. */}
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Not covered yet
            </h3>
            <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
              SocialUs isn&rsquo;t running in these areas, so you can&rsquo;t browse them yet.
            </p>
            {notYet.length > 0 ? (
              <ul className="mt-1" data-testid="scope-not-yet-list">{notYet.slice(0, 40).map(notYetRow)}</ul>
            ) : (
              <p className="mt-1 text-sm text-[var(--color-fg-muted)]">Nothing matching.</p>
            )}
            {notYet.length > 40 ? (
              <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
                {notYet.length - 40} more — search to narrow.
              </p>
            ) : null}
        </>
        </>
        )}
      </div>
    </Sheet>
  )
}

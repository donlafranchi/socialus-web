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
// And the rest are NOT selectable. 295 of the 296 carry no polygon and no
// centroid (the waitlist migration dropped both NOT NULLs), so choosing one
// could only relabel the page while the results underneath stayed exactly the
// same — the precise lie this whole change set is undoing. They are listed
// because a person should be able to find their own metro and see where it
// stands; joining its waitlist from here is the follow-up, not a silent no-op.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fetchChoosableMetros, splitByOpen, type ChoosableMetro } from '@/lib/explore/metros'

export function ScopeSheet({
  open,
  currentSlug,
  onClose,
  onChoose,
}: {
  open: boolean
  currentSlug: string | null
  onClose: () => void
  onChoose: (metro: ChoosableMetro) => void
}) {
  const [metros, setMetros] = useState<ChoosableMetro[] | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!open || metros !== null) return
    let live = true
    fetchChoosableMetros(createClient()).then((m) => {
      if (live) setMetros(m)
    })
    return () => {
      live = false
    }
  }, [open, metros])

  if (!open) return null

  const all = metros ?? []
  const needle = q.trim().toLowerCase()
  const matching = needle ? all.filter((m) => m.name.toLowerCase().includes(needle)) : all
  const { open: served, notYet } = splitByOpen(matching)

  const openRow = (m: ChoosableMetro) => (
    <li key={m.id}>
      <button
        type="button"
        data-testid={`scope-metro-${m.slug}`}
        data-current={m.slug === currentSlug ? 'true' : undefined}
        onClick={() => onChoose(m)}
        className="lift flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface)]"
      >
        <span className="truncate">{m.name}</span>
        {m.slug === currentSlug ? (
          <span className="text-xs font-medium text-[var(--color-accent)]">Showing</span>
        ) : null}
      </button>
    </li>
  )

  const notYetRow = (m: ChoosableMetro) => (
    <li
      key={m.id}
      data-testid={`scope-metro-${m.slug}`}
      data-selectable="false"
      className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-[var(--color-fg-muted)]"
    >
      <span className="truncate">{m.name}</span>
      <span className="shrink-0 text-xs">Not yet</span>
    </li>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Choose your area">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div
        data-testid="scope-sheet"
        className="relative w-full max-w-md rounded-t-2xl bg-white p-4 pb-8 shadow-[0_-6px_16px_rgba(0,0,0,0.12)] sm:rounded-2xl sm:pb-4 max-h-[75vh] overflow-y-auto"
      >
        <h2 className="text-lg font-semibold text-[var(--color-fg)]">Choose your area</h2>

        <input
          type="search"
          data-testid="scope-search"
          aria-label="Search areas"
          placeholder="Search areas"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input mt-3 w-full"
        />

        {metros === null ? (
          <p className="mt-4 text-sm text-[var(--color-fg-muted)]">Loading areas…</p>
        ) : (
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
        )}
      </div>
    </div>
  )
}

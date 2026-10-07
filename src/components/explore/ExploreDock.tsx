'use client'

// #328 — under 1024px, one thumb-reach control at the bottom right. Collapsed
// it is a single button; tapped it opens into search, filter, metro and
// list/map, and shrinks back after a choice. The metro name still sits at the
// top (the search row's pill). Precedents: Material's speed dial, Apple and
// Google Maps' bottom search bar, iOS Safari's bottom address bar, Airbnb's map pill.

import { useEffect, useState } from 'react'
import { Ellipsis, List, MapIcon, MapPin, Search, SlidersHorizontal, X } from 'lucide-react'
import { BROWSE_RESULTS_ID } from '@/components/browse/results-id'
import type { ExploreView } from './ListMapToggle'

const ITEM =
  'press relative inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-white outline-[var(--color-accent)] focus-visible:outline focus-visible:outline-2'

export function ExploreDock({
  view,
  filtersActive,
  onSearch,
  onFilter,
  onMetro,
  onViewChange,
}: {
  view: ExploreView
  filtersActive: boolean
  onSearch: () => void
  onFilter: () => void
  onMetro: () => void
  onViewChange: (view: ExploreView) => void
}) {
  const [open, setOpen] = useState(false)
  const next: ExploreView = view === 'list' ? 'map' : 'list'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const choose = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <div
      data-testid="explore-dock"
      className="fixed bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+16px)] right-3 z-30 flex items-center rounded-full bg-[var(--color-charcoal-700)] p-0.5 shadow-overlay md:bottom-[calc(env(safe-area-inset-bottom)+24px)]"
    >
      {open && (
        <div className="flex items-center">
          <button type="button" data-testid="explore-dock-search" aria-label="Search" onClick={choose(onSearch)} className={ITEM}>
            <Search size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="explore-dock-filter"
            aria-label={filtersActive ? 'Filter — filters applied' : 'Filter'}
            onClick={choose(onFilter)}
            className={ITEM}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            {filtersActive && <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--color-accent)] ring-2 ring-[var(--color-charcoal-700)]" />}
          </button>
          <button type="button" data-testid="explore-dock-metro" aria-label="Change area" onClick={choose(onMetro)} className={ITEM}>
            <MapPin size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="view-pill"
            aria-controls={BROWSE_RESULTS_ID}
            onClick={choose(() => onViewChange(next))}
            className={ITEM}
          >
            {next === 'map' ? <MapIcon size={14} aria-hidden="true" /> : <List size={14} aria-hidden="true" />}
            {next === 'map' ? 'Map' : 'List'}
          </button>
        </div>
      )}
      <button
        type="button"
        data-testid="explore-dock-toggle"
        aria-label="Explore controls"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={ITEM}
      >
        {open ? <X size={18} aria-hidden="true" /> : <Ellipsis size={18} aria-hidden="true" />}
      </button>
    </div>
  )
}

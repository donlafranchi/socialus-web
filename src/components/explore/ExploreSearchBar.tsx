'use client'

// T115 — the sticky Explore search row (F045, thesis §5): locality, search, filters. It
// replaces the market / category / day button row; those filters live in the sheet.
//
// #1141 — search is a permanent field, never an icon that opens one (the PM, 2026-11-01).
// From 744px up it is one row: locality, the field, the list/map switch, filters. On a phone
// this row is gone: the bottom bar (MobileBar) carries the field, area and filters.
//
// The locality pill is now the scope control. It was display-only through b1 —
// F045 placed a pill in the row but specified no picker, and the pre-rebuild
// selector read the retired `markets` table — so the one thing on Browse that
// named a place was the one thing you could not change. It opens the scope
// sheet.

import { useEffect, useRef, type ReactNode } from 'react'
import { placePillLabel, NO_PLACE_CHOSEN_LABEL } from '@/lib/explore/place-label'
import { MapPin, Search, SlidersHorizontal, X } from 'lucide-react'

interface ExploreSearchBarProps {
  /** Current locality display name; null until it resolves. */
  placeName: string | null
  /** False when nobody chose the place — the pill asks instead of asserting. */
  placeChosen?: boolean
  query: string
  onQueryChange: (q: string) => void
  /** Drives the dot — any schedule or tag filter. */
  filtersActive: boolean
  onOpenFilters: () => void
  /** Opens the scope sheet. The pill is the control; there is no second entry point. */
  onOpenScope: () => void
  /** T187 — the docked List | Map switch, when the layout calls for one. */
  viewSwitch?: ReactNode
  /** #328 — bump to focus the search field from outside (the bottom dock). */
  searchRequest?: number
}

export function ExploreSearchBar({
  placeName,
  placeChosen = true,
  query,
  onQueryChange,
  filtersActive,
  onOpenFilters,
  onOpenScope,
  viewSwitch,
  searchRequest = 0,
}: ExploreSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchRequest > 0) inputRef.current?.focus()
  }, [searchRequest])

  const clear = () => {
    onQueryChange('')
    inputRef.current?.focus()
  }

  const label = placePillLabel(placeName === null ? null : { placeName, chosen: placeChosen })

  return (
    <div
      data-testid="explore-search-bar"
      className="sticky top-nav-top z-30 hidden border-b border-[var(--color-charcoal-100)] bg-white md:block"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-2 lg:max-w-none">
        <div className="relative order-2 min-w-0 flex-1">
          <Search
            size={16}
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            ref={inputRef}
            type="search"
            aria-label="Search Browse"
            placeholder="Search Pages and posts"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) clear()
            }}
            data-testid="search-input"
            className="min-h-11 w-full max-w-xl rounded-lg border border-neutral-300 py-2 pl-9 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
          {query && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* It used to print the resolved place name unconditionally, and with
            nothing chosen that name is the seeded launch stand-in — so the pill
            asserted a locality to someone who never named one. It now says what
            is true, and an unanswered question is styled as a question. */}
        <button
          type="button"
          onClick={onOpenScope}
          aria-haspopup="dialog"
          aria-label={
            label === NO_PLACE_CHOSEN_LABEL ? 'Choose your area' : `Area: ${label} — change it`
          }
          data-testid="explore-location-pill"
          data-place-chosen={label === NO_PLACE_CHOSEN_LABEL ? 'false' : 'true'}
          // #951 — plain text with a pin, never a pill (Don, 2026-10-18 [always]).
          className={`press order-1 inline-flex min-h-11 min-w-0 items-center gap-1.5 text-sm font-medium ${
            label === NO_PLACE_CHOSEN_LABEL
              ? 'text-[var(--color-fg-muted)] underline underline-offset-4'
              : 'text-[var(--color-charcoal-900)]'
          }`}
        >
          <MapPin size={14} className="reacts shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </button>

        <div className="order-3 flex items-center">{viewSwitch}</div>

        <button
          type="button"
          onClick={onOpenFilters}
          aria-label={filtersActive ? 'Open filters — filters applied' : 'Open filters'}
          aria-haspopup="dialog"
          data-testid="explore-filter-icon"
          className="press relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-charcoal-900)] hover:bg-neutral-100 order-4"
        >
          <SlidersHorizontal size={18} className="reacts" />
          {filtersActive && (
            <span
              data-testid="filter-active-dot"
              aria-hidden="true"
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--color-accent)] ring-2 ring-white"
            />
          )}
        </button>
      </div>
    </div>
  )
}

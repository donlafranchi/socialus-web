'use client'

// T115 — the sticky Explore search row (F045, thesis §5): one row, three
// elements — locality on the left, search icon, filter icon. It replaces the
// market / category / day button row, which cost a full band of vertical space
// above the results; those filters now live in the bottom sheet.
//
// The locality pill is now the scope control. It was display-only through b1 —
// F045 placed a pill in the row but specified no picker, and the pre-rebuild
// selector read the retired `markets` table — so the one thing on Browse that
// named a place was the one thing you could not change. It opens the scope
// sheet.

import { useEffect, useRef, useState } from 'react'
import { placePillLabel, NO_PLACE_CHOSEN_LABEL } from '@/lib/explore/place-label'
import { MapPin, Search, SlidersHorizontal, X } from 'lucide-react'

interface ExploreSearchBarProps {
  /** Current locality display name; null until it resolves. */
  placeName: string | null
  /** False when nobody chose the place — the pill asks instead of asserting. */
  placeChosen?: boolean
  query: string
  onQueryChange: (q: string) => void
  /** Drives the dot — any distance / schedule / category / sort filter. */
  filtersActive: boolean
  onOpenFilters: () => void
  /** Opens the scope sheet. The pill is the control; there is no second entry point. */
  onOpenScope: () => void
}

export function ExploreSearchBar({
  placeName,
  placeChosen = true,
  query,
  onQueryChange,
  filtersActive,
  onOpenFilters,
  onOpenScope,
}: ExploreSearchBarProps) {
  // An existing query keeps the input open, so a shared `?q=` link shows the
  // terms it filtered by rather than a collapsed icon.
  const [expanded, setExpanded] = useState(query !== '')
  const inputRef = useRef<HTMLInputElement>(null)
  const searchToggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (expanded) inputRef.current?.focus()
  }, [expanded])

  const collapse = () => {
    onQueryChange('')
    setExpanded(false)
    searchToggleRef.current?.focus()
  }

  const label = placePillLabel(placeName === null ? null : { placeName, chosen: placeChosen })

  return (
    <div
      data-testid="explore-search-bar"
      className="sticky top-0 z-30 border-b border-[var(--color-charcoal-100)] bg-white md:top-14"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2 md:px-6">
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
          className={`lift inline-flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
            label === NO_PLACE_CHOSEN_LABEL
              ? 'bg-white text-[var(--color-fg-muted)] ring-1 ring-[var(--color-border)]'
              : 'bg-neutral-100 text-[var(--color-charcoal-900)]'
          }`}
        >
          <MapPin size={14} className="shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            ref={searchToggleRef}
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label="Search"
            aria-expanded={expanded}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-charcoal-900)] hover:bg-neutral-100"
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            onClick={onOpenFilters}
            aria-label={filtersActive ? 'Open filters — filters applied' : 'Open filters'}
            aria-haspopup="dialog"
            data-testid="explore-filter-icon"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-charcoal-900)] hover:bg-neutral-100"
          >
            <SlidersHorizontal size={18} />
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

      {expanded && (
        <div className="mx-auto max-w-5xl px-3 pb-2 md:px-6">
          <div className="relative">
            <Search
              size={16}
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              ref={inputRef}
              type="search"
              aria-label="Search Explore"
              placeholder="Search events, products, services, ideas"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') collapse()
              }}
              data-testid="search-input"
              className="w-full rounded-full border border-neutral-300 py-2.5 pl-9 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
            <button
              type="button"
              onClick={collapse}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

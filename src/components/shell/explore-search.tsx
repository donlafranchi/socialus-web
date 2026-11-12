'use client'

// Don, 2026-11-01 — the search lives in the one top row, which the layout owns. Explore lends it the
// live box, area and sheets while it is on screen; anywhere else the pill sends its words to Explore.

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ExploreView = 'list' | 'map'

export interface ExploreSearch {
  /** The box text (F092): words plus the kind, tag and date words. */
  query: string
  onQueryChange: (q: string) => void
  knownTags: readonly string[]
  areaLabel: string | null
  onOpenScope: () => void
  filtersActive: boolean
  /** Absent where there is nothing to filter (no area yet). */
  onOpenFilters?: () => void
  /** Bump to open the panel on the box (the filter sheet wrote it). */
  focusRequest: number
  /** Only where the layout shows one at a time; the ➕ menu offers the switch. */
  view?: ExploreView
  onViewChange?: (v: ExploreView) => void
}

// Two contexts: the lender subscribes only to the setter, so lending does not re-render Explore.
const Value = createContext<ExploreSearch | null>(null)
const Setter = createContext<(s: ExploreSearch | null) => void>(() => {})

export function ExploreSearchProvider({ children }: { children: ReactNode }) {
  const [search, set] = useState<ExploreSearch | null>(null)
  return (
    <Setter.Provider value={set}>
      <Value.Provider value={search}>{children}</Value.Provider>
    </Setter.Provider>
  )
}

export const useExploreSearch = () => useContext(Value)

export function useLendExploreSearch(search: ExploreSearch) {
  const set = useContext(Setter)
  // The callbacks always reach the latest render's, so only the values decide when to re-lend.
  const latest = useRef(search)
  useEffect(() => {
    latest.current = search
  })
  const { query, knownTags, areaLabel, filtersActive, focusRequest, view } = search
  const canFilter = Boolean(search.onOpenFilters)
  const canSwitch = Boolean(search.onViewChange)
  const lent = useMemo<ExploreSearch>(
    () => ({
      query,
      knownTags,
      areaLabel,
      filtersActive,
      focusRequest,
      view,
      onQueryChange: (q) => latest.current.onQueryChange(q),
      onOpenScope: () => latest.current.onOpenScope(),
      onOpenFilters: canFilter ? () => latest.current.onOpenFilters?.() : undefined,
      onViewChange: canSwitch ? (v) => latest.current.onViewChange?.(v) : undefined,
    }),
    [query, knownTags, areaLabel, filtersActive, focusRequest, view, canFilter, canSwitch],
  )
  useEffect(() => set(lent), [set, lent])
  useEffect(() => () => set(null), [set])
}

'use client'

// Don, 2026-11-01 — the search lives in the one top row, which the layout owns. Explore lends it the
// live box, area and sheets while it is on screen; anywhere else the pill sends its words to Explore.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ExploreView = 'list' | 'map'

export interface ExploreSearch {
  /** The box text (F092): words plus the kind, tag and date words. */
  query: string
  onQueryChange: (q: string) => void
  knownTags: readonly string[]
  areaLabel: string | null
  onOpenScope: () => void
  filtersActive: boolean
  onOpenFilters: () => void
  /** Bump to open the panel on the box (the filter sheet wrote it). */
  focusRequest: number
  /** Only where the layout shows one at a time; the ➕ menu offers the switch. */
  view?: ExploreView
  onViewChange?: (v: ExploreView) => void
}

const Ctx = createContext<{ search: ExploreSearch | null; set: (s: ExploreSearch | null) => void }>({ search: null, set: () => {} })

export function ExploreSearchProvider({ children }: { children: ReactNode }) {
  const [search, set] = useState<ExploreSearch | null>(null)
  return <Ctx.Provider value={{ search, set }}>{children}</Ctx.Provider>
}

export const useExploreSearch = () => useContext(Ctx).search

export function useLendExploreSearch(search: ExploreSearch) {
  const { set } = useContext(Ctx)
  const { query, knownTags, areaLabel, filtersActive, focusRequest, view } = search
  useEffect(() => {
    set(search)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the callbacks are re-lent with the values they read
  }, [set, query, knownTags, areaLabel, filtersActive, focusRequest, view])
  useEffect(() => () => set(null), [set])
}

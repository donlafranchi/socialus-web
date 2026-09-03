// T114 — Explore URL state (F045 § "Filter state persists in URL").
//
// Kind is a first-class param so the pill selection is shareable and composes
// with the secondary filters T115 moves into the bottom sheet.

import type { ItemKindFilter } from './kinds'

export interface ExploreFilters {
  q?: string
  kind?: ItemKindFilter
  category?: string | null
  market?: string | null
  day?: string | null
  view?: 'list' | 'map'
}

/** Serialize active filters. Defaults (All, list view) stay out of the URL. */
export function exploreQueryString(f: ExploreFilters): string {
  const sp = new URLSearchParams()
  if (f.q) sp.set('q', f.q)
  if (f.kind) sp.set('kind', f.kind)
  if (f.category) sp.set('category', f.category)
  if (f.market) sp.set('market', f.market)
  if (f.day) sp.set('day', f.day)
  if (f.view && f.view !== 'list') sp.set('view', f.view)
  return sp.toString()
}

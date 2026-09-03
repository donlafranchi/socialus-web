// T114/T115 — Explore URL state (F045 § "Filter state persists in URL").
//
// Kind is a first-class param so the pill selection is shareable; the T115
// secondary filters ride alongside it, which is what makes a filtered Explore
// link restore the pill row, the chip row, and the sheet's own state together.
// Every default (All, "Any time", newest) stays out of the string so the common
// case is a bare `/explore`. The list/map view is deliberately absent — F044
// makes it ephemeral session state that resets to List on the next visit.

import type { ItemKindFilter } from './kinds'
import type { DistanceMiles, ScheduleFilter, SortOrder } from './filters'

export interface ExploreFilters {
  q?: string
  kind?: ItemKindFilter
  categories?: string[]
  distance?: DistanceMiles | null
  schedule?: ScheduleFilter
  sort?: SortOrder
}

/** Serialize active filters. Defaults stay out of the URL. */
export function exploreQueryString(f: ExploreFilters): string {
  const sp = new URLSearchParams()
  if (f.q) sp.set('q', f.q)
  if (f.kind) sp.set('kind', f.kind)
  if (f.categories?.length) sp.set('category', f.categories.join(','))
  if (f.distance) sp.set('distance', String(f.distance))
  if (f.schedule && f.schedule !== 'any') sp.set('schedule', f.schedule)
  if (f.sort && f.sort !== 'newest') sp.set('sort', f.sort)
  return sp.toString()
}

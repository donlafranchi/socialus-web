// T156 — Browse's URL state (F059 criterion 10: a shared link reopens the same
// metro and the same search).
//
// `?kind=` is gone with the Item kinds it named; `?category=` now carries tags.
// `?sort=` and `?distance=` are gone with their controls. Defaults stay out of
// the string, so the common case is a bare `/explore`. The list/map view is
// deliberately absent — it is ephemeral and resets to List on the next visit.

import type { ScheduleFilter } from './filters'

export interface BrowseUrlState {
  /** Chosen metro slug. Absent when nobody picked one. */
  metro?: string | null
  q?: string
  tags?: string[]
  schedule?: ScheduleFilter
}

export function browseQueryString(s: BrowseUrlState): string {
  const sp = new URLSearchParams()
  if (s.metro) sp.set('metro', s.metro)
  if (s.q) sp.set('q', s.q)
  if (s.tags?.length) sp.set('category', s.tags.join(','))
  if (s.schedule && s.schedule !== 'any') sp.set('schedule', s.schedule)
  return sp.toString()
}

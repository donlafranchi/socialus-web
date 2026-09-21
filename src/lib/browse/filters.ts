// T156 — what still refines a fetched browse page, and what no longer does.
//
// WHAT WENT, AND WHY EACH ONE WENT
//
//   * **Sort.** Ordering is the server's — locality and recency, never payment
//     and never what holds attention (F059 criterion 3). A client control that
//     re-sorted the fetched page would re-order a subset and present it as the
//     order, which is worse than no control.
//
//   * **Distance.** It measured from a locality centroid Browse no longer
//     resolves. The scope is a metro now, and "within 1 mile of the metro
//     centroid" is not a neighbourhood — it is a coordinate. Hood-band ranking
//     inside the metro is explicitly *Not this* in F059.
//
//   * **'Recurring'.** It read `fetchRecurringGatheringIds`, which is
//     Item-grain, and there are no Items. A post carries no recurrence rule.
//
// THE VOCABULARY IS TAGS, NOT CATEGORIES. #53 names twelve fixed terms in
// `src/lib/groups/page-categories.ts`; that file does not exist and its
// constant was retired by T159 (#64, ruled 2026-09-13) — creators make their
// own tags, nothing seeds them. So the options come from the result set, the
// way the Item category options used to, and `normalizeTag` is what stops one
// tag forking into several because two creators typed different casing.
//
// FILTERING PRESERVES SERVER ORDER, and stays client-side with a recorded
// ceiling: at v1 inventory the fetched page *is* the corpus. When a metro's
// Page count approaches the page limit this has to move server-side — at that
// point "the first N" stops meaning "everything" and starts meaning "the N
// highest-ranked", and filtering to a rare tag would search the rows least
// likely to hold it.

import { normalizeTag } from '@/lib/groups/tags'
import type { BrowseResult } from '@/lib/feed/browse-feed'

export const SCHEDULE_OPTIONS = [
  { value: 'any', label: 'Any time' },
  { value: 'week', label: 'This week' },
  { value: 'weekend', label: 'This weekend' },
] as const

export type ScheduleFilter = (typeof SCHEDULE_OPTIONS)[number]['value']

export interface BrowseFilters {
  schedule: ScheduleFilter
  /** Normalised tags. The filter surface's only vocabulary. */
  tags: string[]
}

export const DEFAULT_BROWSE_FILTERS: BrowseFilters = { schedule: 'any', tags: [] }

type ParamSource = Pick<URLSearchParams, 'get'>

const SCHEDULES = new Set<string>(SCHEDULE_OPTIONS.map((s) => s.value))

/**
 * Read the filter state out of the URL.
 *
 * Every value is whitelisted, so a stale link — one carrying `?sort=` or
 * `?distance=` from before those controls were deleted — degrades to the
 * default rather than to an error or an empty surface.
 */
export function parseBrowseFilters(params: ParamSource): BrowseFilters {
  const rawSchedule = params.get('schedule') ?? ''
  return {
    schedule: SCHEDULES.has(rawSchedule) ? (rawSchedule as ScheduleFilter) : 'any',
    tags: (params.get('category') ?? '')
      .split(',')
      .map(normalizeTag)
      .filter(Boolean),
  }
}

/** Drives the dot on the filter icon. */
export function hasBrowseFilters(f: BrowseFilters): boolean {
  return f.schedule !== 'any' || f.tags.length > 0
}

export function toggleTag(f: BrowseFilters, tag: string): BrowseFilters {
  const t = normalizeTag(tag)
  return {
    ...f,
    tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t],
  }
}

export interface DateRange {
  start: Date
  end: Date
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/**
 * "This week" — now through the end of Sunday. ISO weeks (Mon–Sun) rather than
 * the US Sun–Sat convention, so the upcoming weekend always falls inside the
 * current week; under Sun–Sat "this weekend" would straddle the boundary and a
 * weekend result could fail the week filter.
 */
export function weekRange(now: Date): DateRange {
  const daysToSunday = (7 - now.getDay()) % 7 // getDay: Sunday = 0
  return { start: now, end: endOfDay(addDays(now, daysToSunday)) }
}

/** "This weekend" — Saturday and Sunday of the current ISO week, never the past. */
export function weekendRange(now: Date): DateRange {
  const day = now.getDay()
  const daysToSaturday = day === 0 ? 0 : 6 - day
  const saturday = day === 0 ? startOfDay(now) : startOfDay(addDays(now, daysToSaturday))
  const start = saturday.getTime() < now.getTime() ? now : saturday
  const sunday = day === 0 ? startOfDay(now) : addDays(saturday, 1)
  return { start, end: endOfDay(sunday) }
}

function inRange(iso: string | null, range: DateRange): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= range.start.getTime() && t <= range.end.getTime()
}

/** Everything a search looks at: the Page, the post's own words, the tags. */
function haystack(r: BrowseResult): string {
  return [r.name, r.description, r.body, ...r.tags].filter(Boolean).join(' ').toLowerCase()
}

export function searchBrowseResults(results: readonly BrowseResult[], q: string): BrowseResult[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return [...results]
  return results.filter((r) => haystack(r).includes(needle))
}

export function applyBrowseFilters(
  results: readonly BrowseResult[],
  f: BrowseFilters,
  ctx: { now: Date },
): BrowseResult[] {
  const week = f.schedule === 'week' ? weekRange(ctx.now) : null
  const weekend = f.schedule === 'weekend' ? weekendRange(ctx.now) : null

  return results.filter((r) => {
    if (f.tags.length > 0) {
      const own = new Set(r.tags.map(normalizeTag))
      if (!f.tags.some((t) => own.has(t))) return false
    }
    // An undated result has no date to judge, so a time window drops it. That
    // is the window doing its job, not the undated post being second-class —
    // with no window set it ranks alongside everything else.
    if (week && !inRange(r.startsAt, week)) return false
    if (weekend && !inRange(r.startsAt, weekend)) return false
    return true
  })
}

/** The tags actually present in what came back — the filter surface's options. */
export function browseTagOptions(results: readonly BrowseResult[]): string[] {
  return Array.from(new Set(results.flatMap((r) => r.tags.map(normalizeTag)).filter(Boolean))).sort()
}

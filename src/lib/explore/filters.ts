// T115 — the secondary Explore filters that live behind the filter icon (F045).
//
// Kind is deliberately absent: it is the primary browse dimension, it lives on
// the always-visible pill row (T114), and F045 is explicit that it never
// renders as a chip. Everything here is "secondary" in exactly that sense —
// set in the bottom sheet, surfaced as removable chips, counted by the dot on
// the filter icon.
//
// All four filters refine an already-fetched page (T117 fetches kind
// server-side on the MV's indexed column). Distance and schedule need context
// the page cannot carry — an origin to measure from, a clock, and the set of
// gatherings that recur — so they arrive through `SecondaryFilterContext`.

import { categoryLabel, type ExploreItem } from './items'

export const DISTANCE_OPTIONS = [1, 5, 10, 25] as const
export type DistanceMiles = (typeof DISTANCE_OPTIONS)[number]

export const SCHEDULE_OPTIONS = [
  { value: 'any', label: 'Any time' },
  { value: 'week', label: 'This week' },
  { value: 'weekend', label: 'This weekend' },
  { value: 'recurring', label: 'Recurring' },
] as const
export type ScheduleFilter = (typeof SCHEDULE_OPTIONS)[number]['value']

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest', chipLabel: 'Sorted by newest' },
  { value: 'soonest', label: 'Starting soonest', chipLabel: 'Sorted by soonest' },
  { value: 'nearest', label: 'Nearest', chipLabel: 'Sorted by nearest' },
  { value: 'responses', label: 'Most responses', chipLabel: 'Sorted by most responses' },
] as const
export type SortOrder = (typeof SORT_OPTIONS)[number]['value']

export interface SecondaryFilters {
  distance: DistanceMiles | null
  schedule: ScheduleFilter
  categories: string[]
  sort: SortOrder
}

export const DEFAULT_SECONDARY: SecondaryFilters = {
  distance: null,
  schedule: 'any',
  categories: [],
  sort: 'newest',
}

export interface GeoPoint {
  longitude: number
  latitude: number
}

export interface SecondaryFilterContext {
  /** Point the radius is measured from; null disables distance filtering. */
  origin: GeoPoint | null
  now: Date
  /** Item ids whose gathering child carries a recurrence_rule. */
  recurringIds?: ReadonlySet<string>
}

type ParamSource = Pick<URLSearchParams, 'get'>

const NO_RECURRING: ReadonlySet<string> = new Set()

const SCHEDULES = new Set<string>(SCHEDULE_OPTIONS.map((s) => s.value))
const SORTS = new Set<string>(SORT_OPTIONS.map((s) => s.value))

/** Read the sheet's state out of the URL. Every value is whitelisted — a
 *  hand-edited or stale link degrades to the default rather than to nothing. */
export function parseSecondaryFilters(params: ParamSource): SecondaryFilters {
  const rawDistance = Number(params.get('distance'))
  const distance = (DISTANCE_OPTIONS as readonly number[]).includes(rawDistance)
    ? (rawDistance as DistanceMiles)
    : null
  const rawSchedule = params.get('schedule') ?? ''
  const rawSort = params.get('sort') ?? ''
  return {
    distance,
    schedule: SCHEDULES.has(rawSchedule) ? (rawSchedule as ScheduleFilter) : 'any',
    categories: (params.get('category') ?? '').split(',').filter(Boolean),
    sort: SORTS.has(rawSort) ? (rawSort as SortOrder) : 'newest',
  }
}

/** Drives both the dot on the filter icon and whether the chip row renders. */
export function hasSecondaryFilters(f: SecondaryFilters): boolean {
  return (
    f.distance !== null || f.schedule !== 'any' || f.categories.length > 0 || f.sort !== 'newest'
  )
}

export interface FilterChip {
  /** Stable handle the chip's ✕ hands back to `removeFilter`. */
  id: string
  label: string
}

export function activeFilterChips(f: SecondaryFilters): FilterChip[] {
  const chips: FilterChip[] = []
  if (f.distance !== null) chips.push({ id: 'distance', label: `Within ${f.distance} mi` })
  if (f.schedule !== 'any') {
    chips.push({
      id: 'schedule',
      label: SCHEDULE_OPTIONS.find((s) => s.value === f.schedule)!.label,
    })
  }
  for (const slug of f.categories) {
    chips.push({ id: `category:${slug}`, label: categoryLabel(slug) })
  }
  if (f.sort !== 'newest') {
    chips.push({ id: 'sort', label: SORT_OPTIONS.find((s) => s.value === f.sort)!.chipLabel })
  }
  return chips
}

/** Clear the one filter a chip's ✕ names, leaving the rest alone. */
export function removeFilter(f: SecondaryFilters, id: string): SecondaryFilters {
  if (id === 'distance') return { ...f, distance: null }
  if (id === 'schedule') return { ...f, schedule: 'any' }
  if (id === 'sort') return { ...f, sort: 'newest' }
  if (id.startsWith('category:')) {
    const slug = id.slice('category:'.length)
    return { ...f, categories: f.categories.filter((c) => c !== slug) }
  }
  return f
}

export function toggleCategory(f: SecondaryFilters, slug: string): SecondaryFilters {
  return {
    ...f,
    categories: f.categories.includes(slug)
      ? f.categories.filter((c) => c !== slug)
      : [...f.categories, slug],
  }
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

export interface DateRange {
  start: Date
  end: Date
}

/**
 * "This week" — now through the end of Sunday. ISO weeks (Mon–Sun) rather than
 * the US Sun–Sat convention, so that the upcoming weekend always falls inside
 * the current week; under Sun–Sat, "this weekend" would straddle the boundary
 * and a weekend result could fail the week filter.
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

const EARTH_RADIUS_MI = 3958.8
const toRad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance in miles. */
export function distanceMiles(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)))
}

function itemPoint(i: ExploreItem): GeoPoint | null {
  return i.longitude === null || i.latitude === null
    ? null
    : { longitude: i.longitude, latitude: i.latitude }
}

function inRange(iso: string | null, range: DateRange): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= range.start.getTime() && t <= range.end.getTime()
}

export function applySecondaryFilters(
  items: readonly ExploreItem[],
  f: SecondaryFilters,
  ctx: SecondaryFilterContext,
): ExploreItem[] {
  const week = f.schedule === 'week' ? weekRange(ctx.now) : null
  const weekend = f.schedule === 'weekend' ? weekendRange(ctx.now) : null
  const recurring = ctx.recurringIds ?? NO_RECURRING

  return items.filter((i) => {
    if (f.categories.length > 0 && (!i.category || !f.categories.includes(i.category))) return false

    // No origin means no honest way to measure a radius; show everything rather
    // than silently emptying the surface.
    if (f.distance !== null && ctx.origin) {
      const point = itemPoint(i)
      if (!point) return false
      if (distanceMiles(ctx.origin, point) > f.distance) return false
    }

    if (week && !inRange(i.startsAt, week)) return false
    if (weekend && !inRange(i.startsAt, weekend)) return false
    if (f.schedule === 'recurring' && !recurring.has(i.itemId)) return false

    return true
  })
}

export function sortExploreItems(
  items: readonly ExploreItem[],
  sort: SortOrder,
  ctx: Pick<SecondaryFilterContext, 'origin'>,
): ExploreItem[] {
  // Items missing the sort key sink to the bottom rather than to the top, which
  // is where an undefined-as-0 comparison would put them.
  const LAST = Number.POSITIVE_INFINITY
  const key = (i: ExploreItem): number => {
    if (sort === 'soonest') return i.startsAt ? new Date(i.startsAt).getTime() : LAST
    if (sort === 'nearest') {
      const point = itemPoint(i)
      return ctx.origin && point ? distanceMiles(ctx.origin, point) : LAST
    }
    if (sort === 'responses') return -i.responseCount
    return -new Date(i.publishedAt).getTime()
  }
  // Key once per item, not once per comparison — a comparator that called
  // haversine would run it O(n log n) times instead of O(n).
  return items
    .map((item, index) => ({ item, index, key: key(item) }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map((e) => e.item)
}

// T115 — secondary Explore filters (F045 § bottom sheet, chips, URL state).

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SECONDARY,
  parseSecondaryFilters,
  hasSecondaryFilters,
  activeFilterChips,
  removeFilter,
  toggleCategory,
  applySecondaryFilters,
  sortExploreItems,
  weekRange,
  weekendRange,
  distanceMiles,
  type SecondaryFilters,
} from './filters'
import type { ExploreItem } from './items'

function item(over: Partial<ExploreItem> = {}): ExploreItem {
  return {
    itemId: 'i1',
    kind: 'product',
    title: 'Sourdough',
    description: null,
    category: 'food',
    brandLabel: null,
    groupId: null,
    ownerHandle: 'maya',
    ownerDisplayName: 'Maya',
    nearestLocationLabel: 'The Good Market',
    responseCount: 0,
    primaryTag: null,
    photoUrl: null,
    startsAt: null,
    publishedAt: '2026-07-01T00:00:00Z',
    longitude: -121.53,
    latitude: 38.58,
    ...over,
  } as ExploreItem
}

const ORIGIN = { longitude: -121.53, latitude: 38.58 }

describe('parseSecondaryFilters', () => {
  const parse = (qs: string) => parseSecondaryFilters(new URLSearchParams(qs))

  it('returns the defaults for an empty query string', () => {
    expect(parse('')).toEqual(DEFAULT_SECONDARY)
  })

  it('reads every secondary filter back out of the URL', () => {
    expect(parse('distance=5&schedule=weekend&category=food,repair&sort=nearest')).toEqual({
      distance: 5,
      schedule: 'weekend',
      categories: ['food', 'repair'],
      sort: 'nearest',
    })
  })

  it('whitelists distance — an unknown radius falls back to no distance filter', () => {
    expect(parse('distance=7').distance).toBeNull()
    expect(parse('distance=banana').distance).toBeNull()
  })

  it('whitelists schedule and sort rather than trusting the URL', () => {
    expect(parse('schedule=someday').schedule).toBe('any')
    expect(parse('sort=cheapest').sort).toBe('newest')
  })

  it('drops empty category segments', () => {
    expect(parse('category=food,,').categories).toEqual(['food'])
  })
})

describe('hasSecondaryFilters', () => {
  it('is false for the default state — the dot and the chip row stay hidden', () => {
    expect(hasSecondaryFilters(DEFAULT_SECONDARY)).toBe(false)
  })

  it('is true for each secondary filter on its own, sort included', () => {
    expect(hasSecondaryFilters({ ...DEFAULT_SECONDARY, distance: 10 })).toBe(true)
    expect(hasSecondaryFilters({ ...DEFAULT_SECONDARY, schedule: 'weekend' })).toBe(true)
    expect(hasSecondaryFilters({ ...DEFAULT_SECONDARY, categories: ['food'] })).toBe(true)
    expect(hasSecondaryFilters({ ...DEFAULT_SECONDARY, sort: 'nearest' })).toBe(true)
  })
})

describe('activeFilterChips', () => {
  it('is empty when nothing is set — no empty chip row', () => {
    expect(activeFilterChips(DEFAULT_SECONDARY)).toEqual([])
  })

  it('emits one chip per active filter, one per selected category', () => {
    const f: SecondaryFilters = {
      distance: 5,
      schedule: 'weekend',
      categories: ['food', 'repair'],
      sort: 'nearest',
    }
    expect(activeFilterChips(f).map((c) => c.id)).toEqual([
      'distance',
      'schedule',
      'category:food',
      'category:repair',
      'sort',
    ])
    expect(activeFilterChips(f).map((c) => c.label)).toEqual([
      'Within 5 mi',
      'This weekend',
      'Food',
      'Repair',
      'Sorted by nearest',
    ])
  })

  it('never emits a chip for the kind selection — the pills carry that state', () => {
    const ids = activeFilterChips({ ...DEFAULT_SECONDARY, distance: 1 }).map((c) => c.id)
    expect(ids.some((id) => id.startsWith('kind'))).toBe(false)
  })
})

describe('removeFilter', () => {
  const full: SecondaryFilters = {
    distance: 5,
    schedule: 'weekend',
    categories: ['food', 'repair'],
    sort: 'nearest',
  }

  it('clears a scalar filter back to its default', () => {
    expect(removeFilter(full, 'distance').distance).toBeNull()
    expect(removeFilter(full, 'schedule').schedule).toBe('any')
    expect(removeFilter(full, 'sort').sort).toBe('newest')
  })

  it('removes only the named category', () => {
    expect(removeFilter(full, 'category:food').categories).toEqual(['repair'])
  })

  it('leaves the other filters untouched', () => {
    expect(removeFilter(full, 'distance')).toEqual({ ...full, distance: null })
  })

  it('ignores an unknown chip id', () => {
    expect(removeFilter(full, 'nonsense')).toEqual(full)
  })
})

describe('toggleCategory', () => {
  it('adds then removes, keeping selection order stable', () => {
    const once = toggleCategory(DEFAULT_SECONDARY, 'food')
    expect(once.categories).toEqual(['food'])
    expect(toggleCategory(once, 'repair').categories).toEqual(['food', 'repair'])
    expect(toggleCategory(once, 'food').categories).toEqual([])
  })
})

describe('weekRange / weekendRange', () => {
  // Wednesday 2026-09-02T12:00 local.
  const wed = new Date(2026, 8, 2, 12, 0, 0)

  it('this week runs from now to the end of Sunday', () => {
    const { start, end } = weekRange(wed)
    expect(start.getTime()).toBe(wed.getTime())
    expect(end.getDay()).toBe(0) // Sunday
    expect(end.getDate()).toBe(6)
    expect(end.getHours()).toBe(23)
  })

  it('this weekend is the Saturday and Sunday of the current ISO week', () => {
    const { start, end } = weekendRange(wed)
    expect(start.getDay()).toBe(6) // Saturday
    expect(start.getDate()).toBe(5)
    expect(start.getHours()).toBe(0)
    expect(end.getDay()).toBe(0) // Sunday
    expect(end.getDate()).toBe(6)
  })

  it('mid-weekend, the weekend starts now rather than in the past', () => {
    const sat = new Date(2026, 8, 5, 15, 0, 0)
    expect(weekendRange(sat).start.getTime()).toBe(sat.getTime())
  })

  it('keeps the weekend inside the week, so weekend results always survive the week filter', () => {
    const wk = weekRange(wed)
    const we = weekendRange(wed)
    expect(we.start.getTime()).toBeGreaterThanOrEqual(wk.start.getTime())
    expect(we.end.getTime()).toBeLessThanOrEqual(wk.end.getTime())
  })
})

describe('distanceMiles', () => {
  it('is zero at the origin', () => {
    expect(distanceMiles(ORIGIN, ORIGIN)).toBe(0)
  })

  it('measures a known separation — West Sacramento to Davis is about 11 mi', () => {
    const davis = { longitude: -121.74, latitude: 38.545 }
    expect(distanceMiles(ORIGIN, davis)).toBeGreaterThan(10)
    expect(distanceMiles(ORIGIN, davis)).toBeLessThan(13)
  })
})

describe('applySecondaryFilters', () => {
  const now = new Date(2026, 8, 2, 12, 0, 0) // Wednesday
  const opts = { origin: ORIGIN, now, recurringIds: new Set(['rec']) }

  it('passes everything through when nothing is set', () => {
    const items = [item(), item({ itemId: 'i2' })]
    expect(applySecondaryFilters(items, DEFAULT_SECONDARY, opts)).toHaveLength(2)
  })

  it('keeps only items inside the chosen radius', () => {
    const near = item({ itemId: 'near' })
    const far = item({ itemId: 'far', longitude: -122.42, latitude: 37.77 }) // SF
    const out = applySecondaryFilters([near, far], { ...DEFAULT_SECONDARY, distance: 25 }, opts)
    expect(out.map((i) => i.itemId)).toEqual(['near'])
  })

  it('drops items with no location when a radius is set — proximity cannot be verified', () => {
    const placeless = item({ itemId: 'nowhere', longitude: null, latitude: null })
    expect(applySecondaryFilters([placeless], { ...DEFAULT_SECONDARY, distance: 25 }, opts)).toEqual([])
  })

  it('keeps items with no location when no radius is set', () => {
    const placeless = item({ itemId: 'nowhere', longitude: null, latitude: null })
    expect(applySecondaryFilters([placeless], DEFAULT_SECONDARY, opts)).toHaveLength(1)
  })

  it('narrows to this week', () => {
    const thurs = item({ itemId: 'thurs', startsAt: new Date(2026, 8, 3, 18).toISOString() })
    const nextMonth = item({ itemId: 'later', startsAt: new Date(2026, 9, 3, 18).toISOString() })
    const undated = item({ itemId: 'undated', startsAt: null })
    const out = applySecondaryFilters([thurs, nextMonth, undated], { ...DEFAULT_SECONDARY, schedule: 'week' }, opts)
    expect(out.map((i) => i.itemId)).toEqual(['thurs'])
  })

  it('narrows to this weekend', () => {
    const thurs = item({ itemId: 'thurs', startsAt: new Date(2026, 8, 3, 18).toISOString() })
    const sat = item({ itemId: 'sat', startsAt: new Date(2026, 8, 5, 10).toISOString() })
    const out = applySecondaryFilters([thurs, sat], { ...DEFAULT_SECONDARY, schedule: 'weekend' }, opts)
    expect(out.map((i) => i.itemId)).toEqual(['sat'])
  })

  it('narrows to items with a recurrence rule', () => {
    const once = item({ itemId: 'once' })
    const repeats = item({ itemId: 'rec' })
    const out = applySecondaryFilters([once, repeats], { ...DEFAULT_SECONDARY, schedule: 'recurring' }, opts)
    expect(out.map((i) => i.itemId)).toEqual(['rec'])
  })

  it('treats the category multi-select as OR across the selected categories', () => {
    const food = item({ itemId: 'food', category: 'food' })
    const repair = item({ itemId: 'repair', category: 'repair' })
    const garden = item({ itemId: 'garden', category: 'garden' })
    const out = applySecondaryFilters(
      [food, repair, garden],
      { ...DEFAULT_SECONDARY, categories: ['food', 'repair'] },
      opts,
    )
    expect(out.map((i) => i.itemId)).toEqual(['food', 'repair'])
  })

  it('falls back to no distance filtering when the origin is unknown', () => {
    const far = item({ itemId: 'far', longitude: -122.42, latitude: 37.77 })
    const out = applySecondaryFilters([far], { ...DEFAULT_SECONDARY, distance: 1 }, { ...opts, origin: null })
    expect(out).toHaveLength(1)
  })
})

describe('sortExploreItems', () => {
  const now = new Date(2026, 8, 2, 12, 0, 0)
  const opts = { origin: ORIGIN, now }

  const a = item({ itemId: 'a', publishedAt: '2026-07-01T00:00:00Z', responseCount: 5, startsAt: new Date(2026, 8, 9).toISOString() })
  const b = item({ itemId: 'b', publishedAt: '2026-08-01T00:00:00Z', responseCount: 1, startsAt: new Date(2026, 8, 4).toISOString(), longitude: -122.42, latitude: 37.77 })

  it('defaults to newest first', () => {
    expect(sortExploreItems([a, b], 'newest', opts).map((i) => i.itemId)).toEqual(['b', 'a'])
  })

  it('sorts soonest by start time, undated items last', () => {
    const undated = item({ itemId: 'u', startsAt: null })
    expect(sortExploreItems([a, undated, b], 'soonest', opts).map((i) => i.itemId)).toEqual(['b', 'a', 'u'])
  })

  it('sorts nearest by distance from the origin, unplaced items last', () => {
    const unplaced = item({ itemId: 'u', longitude: null, latitude: null })
    expect(sortExploreItems([b, unplaced, a], 'nearest', opts).map((i) => i.itemId)).toEqual(['a', 'b', 'u'])
  })

  it('sorts by response count descending', () => {
    expect(sortExploreItems([b, a], 'responses', opts).map((i) => i.itemId)).toEqual(['a', 'b'])
  })

  it('does not mutate the input array', () => {
    const input = [a, b]
    sortExploreItems(input, 'responses', opts)
    expect(input.map((i) => i.itemId)).toEqual(['a', 'b'])
  })
})

describe('sortExploreItems — review fixes', () => {
  const opts = { origin: ORIGIN }

  it('keeps ties in their incoming order', () => {
    const a = item({ itemId: 'a', responseCount: 2 })
    const b = item({ itemId: 'b', responseCount: 2 })
    const c = item({ itemId: 'c', responseCount: 2 })
    expect(sortExploreItems([a, b, c], 'responses', opts).map((i) => i.itemId)).toEqual(['a', 'b', 'c'])
  })

  it('measures each item once rather than once per comparison', () => {
    const many = Array.from({ length: 32 }, (_, n) =>
      item({ itemId: `i${n}`, longitude: -121.53 - n * 0.01, latitude: 38.58 }),
    )
    const out = sortExploreItems(many, 'nearest', opts)
    expect(out[0].itemId).toBe('i0')
    expect(out.at(-1)!.itemId).toBe('i31')
  })
})

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BROWSE_FILTERS,
  applyBrowseFilters,
  browseTagOptions,
  hasBrowseFilters,
  parseBrowseFilters,
  searchBrowseResults,
  toggleTag,
} from './filters'
import type { BrowseResult } from '@/lib/feed/browse-feed'

function result(over: Partial<BrowseResult> = {}): BrowseResult {
  return {
    resultKind: 'page',
    resultId: 'r1',
    groupId: 'g1',
    groupKind: 'business',
    slug: 'sourdough-co',
    name: 'Sourdough Co',
    href: '/p/ca/sac/g/sourdough-co',
    photoUrl: null,
    description: 'Bread, daily',
    body: null,
    tags: ['local food'],
    startsAt: null,
    locationId: 'loc1',
    locationLabel: 'Midtown',
    longitude: -121.4,
    latitude: 38.5,
    pageCreatedAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-02T00:00:00Z',
    sortAt: '2026-09-02T00:00:00Z',
    withheld: false,
    announcementCount: null,
    ...over,
  }
}

describe('T156 — parseBrowseFilters', () => {
  it('defaults with nothing in the URL', () => {
    expect(parseBrowseFilters(new URLSearchParams())).toEqual(DEFAULT_BROWSE_FILTERS)
  })

  it('reads schedule and tags', () => {
    const f = parseBrowseFilters(new URLSearchParams('schedule=weekend&category=local food,art'))
    expect(f).toEqual({ schedule: 'weekend', tags: ['local food', 'art'] })
  })

  it('falls back to Any time for a schedule it does not know', () => {
    expect(parseBrowseFilters(new URLSearchParams('schedule=recurring')).schedule).toBe('any')
  })

  it('ignores ?sort= and ?distance= — both controls are gone', () => {
    const f = parseBrowseFilters(new URLSearchParams('sort=nearest&distance=5'))
    expect(f).toEqual(DEFAULT_BROWSE_FILTERS)
  })
})

describe('T156 — hasBrowseFilters', () => {
  it('is false for the defaults', () => {
    expect(hasBrowseFilters(DEFAULT_BROWSE_FILTERS)).toBe(false)
  })
  it('is true once a tag or a schedule is set', () => {
    expect(hasBrowseFilters({ schedule: 'week', tags: [] })).toBe(true)
    expect(hasBrowseFilters({ schedule: 'any', tags: ['art'] })).toBe(true)
  })
})

describe('T156 — toggleTag', () => {
  it('adds then removes', () => {
    const on = toggleTag(DEFAULT_BROWSE_FILTERS, 'art')
    expect(on.tags).toEqual(['art'])
    expect(toggleTag(on, 'art').tags).toEqual([])
  })
})

describe('T156 — searchBrowseResults', () => {
  it('returns everything for an empty query', () => {
    const rows = [result()]
    expect(searchBrowseResults(rows, '')).toEqual(rows)
  })

  it('matches a Page name, case-insensitively', () => {
    expect(searchBrowseResults([result()], 'SOURDOUGH')).toHaveLength(1)
  })

  it("matches a post's own words, not only the Page's", () => {
    const post = result({ resultKind: 'post', name: 'Sourdough Co', description: null, body: 'rye is back Thursday' })
    expect(searchBrowseResults([post], 'rye')).toHaveLength(1)
  })

  it('matches a tag', () => {
    expect(searchBrowseResults([result()], 'local food')).toHaveLength(1)
  })

  it('drops what does not match', () => {
    expect(searchBrowseResults([result()], 'manure')).toHaveLength(0)
  })
})

describe('T156 — applyBrowseFilters', () => {
  const now = new Date('2026-09-16T12:00:00Z') // a Wednesday

  it('keeps everything by default', () => {
    const rows = [result(), result({ resultId: 'r2', tags: [] })]
    expect(applyBrowseFilters(rows, DEFAULT_BROWSE_FILTERS, { now })).toEqual(rows)
  })

  it('narrows to a tag', () => {
    const rows = [result(), result({ resultId: 'r2', tags: ['art'] })]
    const out = applyBrowseFilters(rows, { schedule: 'any', tags: ['art'] }, { now })
    expect(out.map((r) => r.resultId)).toEqual(['r2'])
  })

  it('matches a tag whatever the creator typed for casing and spacing', () => {
    const rows = [result({ tags: ['Local  Food'] })]
    const out = applyBrowseFilters(rows, { schedule: 'any', tags: ['local food'] }, { now })
    expect(out).toHaveLength(1)
  })

  it('a schedule window drops an undated result, because it has no date to judge', () => {
    const rows = [result({ startsAt: null })]
    expect(applyBrowseFilters(rows, { schedule: 'week', tags: [] }, { now })).toHaveLength(0)
  })

  it('keeps a dated result inside the week', () => {
    const rows = [result({ startsAt: '2026-09-18T18:00:00Z' })]
    expect(applyBrowseFilters(rows, { schedule: 'week', tags: [] }, { now })).toHaveLength(1)
  })

  it('preserves server order — filtering never re-sorts', () => {
    const rows = [result({ resultId: 'a' }), result({ resultId: 'b' }), result({ resultId: 'c' })]
    const out = applyBrowseFilters(rows, DEFAULT_BROWSE_FILTERS, { now })
    expect(out.map((r) => r.resultId)).toEqual(['a', 'b', 'c'])
  })
})

describe('T156 — browseTagOptions', () => {
  it('is the tags present in the result set, deduped and sorted', () => {
    const rows = [result({ tags: ['art', 'local food'] }), result({ resultId: 'r2', tags: ['art'] })]
    expect(browseTagOptions(rows)).toEqual(['art', 'local food'])
  })

  it('normalises so one tag does not fork into several options', () => {
    const rows = [result({ tags: ['Art'] }), result({ resultId: 'r2', tags: ['art'] })]
    expect(browseTagOptions(rows)).toEqual(['art'])
  })
})

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BROWSE_FILTERS,
  applyBrowseFilters,
  browseTagOptions,
  hasBrowseFilters,
  parseBrowseFilters,
  searchBrowseResults,
  toggleTag,
  type BrowseFilters,
} from './filters'

const F = (over: Partial<BrowseFilters> = {}): BrowseFilters => ({ ...DEFAULT_BROWSE_FILTERS, ...over })
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
    postedAt: null,
    sortAt: '2026-09-02T00:00:00Z',
    withheld: false,
    announcementCount: null,
    announcementIds: null,
    ...over,
  }
}

describe('T156 — parseBrowseFilters', () => {
  it('defaults with nothing in the URL', () => {
    expect(parseBrowseFilters(new URLSearchParams())).toEqual(DEFAULT_BROWSE_FILTERS)
  })

  it('reads an old link\'s schedule as the Date and its category as tags', () => {
    const f = parseBrowseFilters(new URLSearchParams('schedule=weekend&category=local food,art'))
    expect(f).toEqual(F({ date: 'weekend', tags: ['local food', 'art'] }))
  })

  it('falls back to Any time for a schedule it does not know', () => {
    expect(parseBrowseFilters(new URLSearchParams('schedule=recurring')).date).toBe('any')
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
  it('is true once any group is set', () => {
    expect(hasBrowseFilters(F({ date: 'week' }))).toBe(true)
    expect(hasBrowseFilters(F({ tags: ['art'] }))).toBe(true)
    expect(hasBrowseFilters(F({ type: 'posts' }))).toBe(true)
    expect(hasBrowseFilters(F({ postKinds: ['deal'] }))).toBe(true)
    expect(hasBrowseFilters(F({ following: true }))).toBe(true)
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
    const out = applyBrowseFilters(rows, F({ tags: ['art'] }), { now })
    expect(out.map((r) => r.resultId)).toEqual(['r2'])
  })

  it('matches a tag whatever the creator typed for casing and spacing', () => {
    const rows = [result({ tags: ['Local  Food'] })]
    const out = applyBrowseFilters(rows, F({ tags: ['local food'] }), { now })
    expect(out).toHaveLength(1)
  })

  it('a schedule window drops an undated result, because it has no date to judge', () => {
    const rows = [result({ startsAt: null })]
    expect(applyBrowseFilters(rows, F({ date: 'week' }), { now })).toHaveLength(0)
  })

  it('keeps a dated result inside the week', () => {
    const rows = [result({ resultKind: 'post', startsAt: '2026-09-18T18:00:00Z' })]
    expect(applyBrowseFilters(rows, F({ date: 'week' }), { now })).toHaveLength(1)
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

describe('#796 — the Updates view is the posts-only Type', () => {
  it('comes in from ?view=updates, lights the filter dot, and shows only posts', () => {
    const f = parseBrowseFilters(new URLSearchParams('view=updates'))
    expect(f.type).toBe('posts')
    expect(hasBrowseFilters(f)).toBe(true)
    const rows = [result({ resultId: 'p', resultKind: 'page' }), result({ resultId: 'post', resultKind: 'post' })]
    expect(applyBrowseFilters(rows, f, { now: new Date() }).map((r) => r.resultId)).toEqual(['post'])
  })
})

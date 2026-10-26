// #876 (Don, 2026-10-16, on #796): "Target by type or category or date." Explore's default mixes
// everything; three opt-in filter groups narrow it, combine with each other and with search, and
// are pushed into the feed read.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BROWSE_FILTERS,
  applyBrowseFilters,
  feedOptsFor,
  hasBrowseFilters,
  parseBrowseFilters,
  postKindOf,
  type BrowseFilters,
} from './filters'
import { readBox, writeBox } from './box-text'
import type { BrowseResult } from '@/lib/feed/browse-feed'

// Friday 2026-10-16, 10:00 in Sacramento (17:00Z).
const NOW = new Date('2026-10-16T17:00:00Z')
const r = (over: Partial<BrowseResult>): BrowseResult =>
  ({ resultKind: 'post', resultId: 'x', groupId: 'g', tags: [], startsAt: null, endsAt: null, sampleKind: null, name: 'N', body: '', description: null, followed: false, ...over }) as BrowseResult
const f = (over: Partial<BrowseFilters>): BrowseFilters => ({ ...DEFAULT_BROWSE_FILTERS, ...over })

const page = r({ resultKind: 'page', resultId: 'page', startsAt: null })
const tonight = r({ resultId: 'tonight', startsAt: '2026-10-17T02:00:00Z' })
const saturday = r({ resultId: 'saturday', startsAt: '2026-10-17T18:00:00Z', tags: ['Farmers markets'] })
const ongoing = r({ resultId: 'ongoing', startsAt: '2026-10-15T15:00:00Z', endsAt: '2026-10-20T15:00:00Z' })
const deal = r({ resultId: 'deal', startsAt: '2026-10-16T19:00:00Z', endsAt: '2026-10-22T19:00:00Z', sampleKind: 'deal' })
const undated = r({ resultId: 'undated' })
const followed = r({ resultId: 'followed', followed: true })
const all = [page, tonight, saturday, ongoing, deal, undated, followed]
const ids = (fs: BrowseFilters) => applyBrowseFilters(all, fs, { now: NOW }).map((x) => x.resultId)

describe('the default mixes everything', () => {
  it('keeps Pages and posts, dated and undated', () => {
    expect(ids(DEFAULT_BROWSE_FILTERS)).toEqual(all.map((x) => x.resultId))
    expect(hasBrowseFilters(DEFAULT_BROWSE_FILTERS)).toBe(false)
  })
})

describe('Type', () => {
  it('Pages only / posts only', () => {
    expect(ids(f({ type: 'pages' }))).toEqual(['page'])
    expect(ids(f({ type: 'posts' }))).not.toContain('page')
  })
  it('post kind: a sample by its own kind, a dated real post as an event, an undated one as none', () => {
    expect(postKindOf(deal)).toBe('deal')
    expect(postKindOf(tonight)).toBe('event')
    expect(postKindOf(undated)).toBeNull()
    expect(ids(f({ postKinds: ['deal'] }))).toEqual(['deal'])
    expect(ids(f({ postKinds: ['event'] }))).toEqual(['tonight', 'saturday', 'ongoing'])
  })
  it('following only', () => {
    expect(ids(f({ following: true }))).toEqual(['followed'])
  })
})

describe('Category', () => {
  it('narrows to an interest tag, whatever its casing', () => {
    expect(ids(f({ tags: ['farmers markets'] }))).toEqual(['saturday'])
  })
})

describe('Date — posts live in the window, start through end', () => {
  it('today holds what is on today, including something that started earlier and ends later', () => {
    expect(ids(f({ date: 'today' }))).toEqual(['tonight', 'ongoing', 'deal'])
  })
  it('this weekend', () => {
    expect(ids(f({ date: 'weekend' }))).toEqual(['saturday', 'ongoing', 'deal'])
  })
  it('a picked day', () => {
    expect(ids(f({ date: '2026-10-21' }))).toEqual(['deal'])
  })
})

describe('the groups combine', () => {
  it('a kind and a date together', () => {
    expect(ids(f({ postKinds: ['event'], date: 'weekend' }))).toEqual(['saturday', 'ongoing'])
  })
})

describe('the box and the URL', () => {
  const tags = ['farmers markets']
  it('every group round-trips through the box words', () => {
    const sel = f({ type: 'posts', postKinds: ['deal', 'last_minute'], following: true, tags, date: '2026-10-21' })
    expect(readBox(writeBox(sel, 'bread'), tags)).toEqual({ filters: sel, rest: 'bread' })
    for (const date of ['today', 'weekend', 'week'] as const) expect(readBox(writeBox(f({ date })), tags).filters.date).toBe(date)
  })
  it('?view=updates, the old Updates view, is the posts-only filter', () => {
    expect(parseBrowseFilters(new URLSearchParams('view=updates')).type).toBe('posts')
    expect(readBox('updates', []).filters.type).toBe('posts')
  })
  it('?schedule=weekend still reads as this weekend', () => {
    expect(parseBrowseFilters(new URLSearchParams('schedule=weekend')).date).toBe('weekend')
  })
})

describe('pushed into the feed read', () => {
  it('no filters: no narrowing', () => {
    expect(feedOptsFor(DEFAULT_BROWSE_FILTERS, NOW)).toEqual({ resultKinds: null, postKinds: null, tags: null, startsFrom: null, startsBefore: null, sort: 'recent', following: false })
  })
  it('a date or a kind asks for posts, soonest first, inside the window', () => {
    const o = feedOptsFor(f({ postKinds: ['event'], date: '2026-10-21' }), NOW)
    expect(o).toMatchObject({ resultKinds: ['post'], postKinds: ['event'], sort: 'soonest' })
    expect(o.startsFrom).toBe('2026-10-21T07:00:00.000Z')
    expect(o.startsBefore).toBe('2026-10-22T07:00:00.000Z')
  })
  it('Pages only, a category and following', () => {
    expect(feedOptsFor(f({ type: 'pages', tags: ['farmers markets'], following: true }), NOW)).toMatchObject({ resultKinds: ['page'], tags: ['farmers markets'], following: true })
  })
})

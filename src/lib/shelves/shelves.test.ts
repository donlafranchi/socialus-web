// F121 — the shelves Explore shows: which, in what order, what each asks the feed for, and what fills it.
import { describe, it, expect } from 'vitest'
import { arrangeShelves, feedArgs, fillShelves, inSeason, rotate, type ShelfRow } from './shelves'
import type { BrowseResult } from '@/lib/feed/browse-feed'

const row = (id: string, over: Partial<ShelfRow> = {}): ShelfRow => ({
  id,
  name: id,
  query: {},
  leadDays: 14,
  place: 'rotating',
  fixedOrder: null,
  seasonStart: null,
  seasonEnd: null,
  kind: 'query',
  ...over,
})
const ROWS: ShelfRow[] = [
  row('from-who-you-follow', { name: 'From who you follow', place: 'fixed', fixedOrder: 1, kind: 'followed', query: { audience: 'following' } }),
  row('next-7-days', { name: 'Next 7 days', place: 'fixed', fixedOrder: 2, leadDays: 7, query: { datedOnly: true } }),
  row('because-you-like', { name: 'Because you like {interest}', kind: 'interest' }),
  row('a'),
  row('b'),
  row('c'),
  row('thanksgiving', { seasonStart: '2026-11-02', seasonEnd: '2026-11-28' }),
]
const NOV3 = '2026-11-03'

describe('F121 — which shelves, in what order', () => {
  // [guards F121.8]
  it('a seasonal shelf shows only inside its dates, and turns itself off after', () => {
    const t = ROWS.at(-1)!
    expect(inSeason(t, '2026-11-01')).toBe(false)
    expect(inSeason(t, '2026-11-02')).toBe(true)
    expect(inSeason(t, '2026-11-28')).toBe(true)
    expect(inSeason(t, '2026-11-29')).toBe(false)
    expect(inSeason(ROWS[3]!, '2030-01-01')).toBe(true)
  })

  // [guards F121.10]
  it('the followed shelf and Next 7 days come first; the rest rotate per member per day and hold still within a day', () => {
    const a = arrangeShelves(ROWS, { today: NOV3, member: 'm1', interests: [] })
    expect(a.slice(0, 2).map((s) => s.id)).toEqual(['from-who-you-follow', 'next-7-days'])
    expect(arrangeShelves(ROWS, { today: NOV3, member: 'm1', interests: [] })).toEqual(a)
    const days = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map((today) => arrangeShelves(ROWS, { today, member: 'm1', interests: [] }).slice(2).map((s) => s.id))
    expect(new Set(days.map((d) => d.join())).size).toBe(4)
  })

  // [guards F121.10]
  it('over as many days as there are rotating shelves, each spends exactly one day in each position', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const at = new Map(items.map((i) => [i, new Set<number>()]))
    for (let day = 0; day < items.length; day++) rotate(items, 'm1', day).forEach((x, pos) => at.get(x)!.add(pos))
    for (const positions of at.values()) expect(positions.size).toBe(items.length)
  })

  // [guards F121.7]
  it('one interest shelf per declared interest, three at most, none signed out; the followed shelf only signed in', () => {
    const interests = ['Gardening', 'Live music', 'Farmers markets', 'Crafts & makers'].map((label) => ({ label }))
    const signedIn = arrangeShelves(ROWS, { today: NOV3, member: 'm1', interests })
    const mine = signedIn.filter((s) => s.logId === 'because-you-like')
    expect(mine.map((s) => s.title).sort()).toEqual(['Because you like farmers markets', 'Because you like gardening', 'Because you like live music'])
    expect(mine.find((s) => s.title.endsWith('gardening'))!.query.tags).toEqual(['gardening'])
    const out = arrangeShelves(ROWS, { today: NOV3, member: null, interests: [] })
    expect(out.map((s) => s.id)).not.toContain('from-who-you-follow')
    expect(out.filter((s) => s.logId === 'because-you-like')).toEqual([])
  })
})

describe('F121 — what a shelf asks for', () => {
  const NOW = new Date('2026-11-03T18:00:00Z')
  // [guards F121.3]
  it('a dated-only shelf reads its lead time as the window; Plan ahead starts two weeks out', () => {
    expect(feedArgs({ query: { datedOnly: true }, leadDays: 7 }, NOW)).toMatchObject({
      startsFrom: NOW.toISOString(),
      startsBefore: '2026-11-10T18:00:00.000Z',
    })
    expect(feedArgs({ query: { datedOnly: true, startsFromDays: 14 }, leadDays: 42 }, NOW)).toMatchObject({
      startsFrom: '2026-11-17T18:00:00.000Z',
      startsBefore: '2026-12-15T18:00:00.000Z',
    })
    expect(feedArgs({ query: { tags: ['volunteering'], anyOf: ['run', 'ride'], postKinds: ['wonder'] }, leadDays: 14 }, NOW)).toEqual({
      tags: ['volunteering'],
      anyOf: ['run', 'ride'],
      postKinds: ['wonder'],
      startsFrom: null,
      startsBefore: null,
    })
  })
})

describe('F121 — what fills a shelf', () => {
  const NOW = new Date('2026-11-03T18:00:00Z')
  let n = 0
  const post = (over: Partial<BrowseResult> = {}): BrowseResult => ({ resultKind: 'post', resultId: `p${++n}`, startsAt: null, sampleKind: null, ...over }) as BrowseResult
  const shelf = (id: string, leadDays: number | null = 14) => ({ id, logId: id, title: id, query: {}, leadDays })

  // [guards F121.4] [guards F121.5]
  it('an item goes in the first shelf it qualifies for; an empty shelf is absent; a shelf holds at most 12', () => {
    const shared = post()
    const many = Array.from({ length: 20 }, () => post())
    const filled = fillShelves([shelf('one'), shelf('two'), shelf('three')], [[shared, ...many], [shared], []], NOW)
    expect(filled.map((f) => f.shelf.id)).toEqual(['one'])
    expect(filled[0]!.items).toHaveLength(12)
  })

  // [guards F121.3]
  it('a dated post shows only once it starts within the shelf’s lead time; Pages never sit on a post shelf', () => {
    const soon = post({ startsAt: '2026-11-05T18:00:00Z' })
    const later = post({ startsAt: '2026-12-25T18:00:00Z' })
    const undated = post()
    const page = { ...post(), resultKind: 'page' } as BrowseResult
    const [f] = fillShelves([shelf('s')], [[soon, later, undated, page]], NOW)
    expect(f!.items.map((i) => i.resultId)).toEqual([soon.resultId, undated.resultId])
  })

  it('Sample posts are at most one card in four', () => {
    const reals = Array.from({ length: 3 }, () => post())
    const samples = Array.from({ length: 6 }, () => post({ sampleKind: 'event' }))
    const [f] = fillShelves([shelf('s')], [[...samples, ...reals]], NOW)
    expect(f!.items.filter((i) => i.sampleKind)).toHaveLength(1)
    expect(f!.items).toHaveLength(4)
    expect(fillShelves([shelf('s')], [samples], NOW)).toEqual([])
  })
})

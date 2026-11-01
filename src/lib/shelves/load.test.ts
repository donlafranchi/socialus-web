// F121 — loading Explore's shelves: signed in only, the rows that are on, one read per shelf, empty ones left out.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const feed = vi.fn()
vi.mock('@/lib/feed/browse-feed', () => ({ getBrowseFeed: (...a: unknown[]) => feed(...a) }))
vi.mock('@/lib/feed/followed-pages', () => ({ resolveFollowedPageIds: async () => ['page-1'] }))

import { loadShelves } from './load'

const ROWS = [
  { id: 'from-who-you-follow', name: 'From who you follow', query: { audience: 'following' }, lead_days: 14, place: 'fixed', fixed_order: 1, season_start: null, season_end: null, kind: 'followed' },
  { id: 'next-7-days', name: 'Next 7 days', query: { datedOnly: true }, lead_days: 7, place: 'fixed', fixed_order: 2, season_start: null, season_end: null, kind: 'query' },
  { id: 'lend-a-hand', name: 'Lend a hand', query: { tags: ['volunteering'] }, lead_days: 14, place: 'rotating', fixed_order: null, season_start: null, season_end: null, kind: 'query' },
]
const supabase = {
  from: (table: string) => ({
    select: () => ({
      eq: async () => (table === 'shelves' ? { data: ROWS, error: null } : { data: [{ tag: 'gardening' }], error: null }),
    }),
  }),
  rpc: vi.fn(),
}
const NOW = new Date('2026-11-03T18:00:00Z')
const post = (id: string, startsAt: string | null = null) => ({ resultKind: 'post', resultId: id, startsAt, sampleKind: null })

beforeEach(() => feed.mockReset())

describe('F121 — loadShelves', () => {
  it('signed out reads nothing', async () => {
    expect(await loadShelves(supabase as never, { scope: { metroId: 'm' }, memberId: null, now: NOW })).toEqual([])
    expect(feed).not.toHaveBeenCalled()
  })

  // [guards F121.5] [guards F121.7]
  it('one read per shelf (posts only, followed Pages for the followed shelf, the window for Next 7 days); empty shelves are absent', async () => {
    feed.mockImplementation(async (_s: unknown, opts: { audience?: unknown; startsFrom?: string | null } = {}) =>
      opts.audience ? [post('f1')] : opts.startsFrom ? [post('soon', '2026-11-04T18:00:00Z')] : [],
    )
    const shelves = await loadShelves(supabase as never, { scope: { metroId: 'm' }, memberId: 'me', now: NOW })
    expect(shelves.map((s) => s.title)).toEqual(['From who you follow', 'Next 7 days'])
    expect(feed).toHaveBeenCalledTimes(3)
    const calls = feed.mock.calls.map((c) => c[1])
    expect(calls.every((o) => o.resultKinds[0] === 'post')).toBe(true)
    expect(calls.find((o) => o.audience)).toMatchObject({ audience: { audience: 'following', following: ['page-1'] } })
    expect(calls.find((o) => o.startsFrom)).toMatchObject({ startsFrom: NOW.toISOString(), startsBefore: '2026-11-10T18:00:00.000Z', sort: 'soonest' })
    expect(calls.find((o) => o.tags)).toMatchObject({ tags: ['volunteering'] })
  })

  it('a failed read costs only that shelf', async () => {
    feed.mockImplementation(async (_s: unknown, opts: { startsFrom?: string | null } = {}) => {
      if (opts.startsFrom) throw new Error('boom')
      return [post('x')]
    })
    const shelves = await loadShelves(supabase as never, { scope: { metroId: 'm' }, memberId: 'me', now: NOW })
    expect(shelves.map((s) => s.id)).toEqual(['from-who-you-follow'])
  })
})

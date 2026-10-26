// #1090 — what /open/<market> shows: a market's name, whether it is open, and
// its makers and supporters against the goal, from the cached snapshot only.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const tables: Record<string, Record<string, unknown>[]> = {}
const names: Record<string, string> = { sacramento: 'Sacramento', tahoe: 'Lake Tahoe', 'county-06115': 'Yuba County, CA' }

vi.mock('@/lib/supabase-anon', () => ({
  createAnonClient: () => ({
    rpc: async (_fn: string, args: { p_key: string }) => ({ data: names[args.p_key] ?? null, error: null }),
    from: (t: string) => ({
      select: () => ({
        eq: (col: string, val: unknown) => ({
          maybeSingle: async () => ({ data: (tables[t] ?? []).find((r) => r[col] === val) ?? null, error: null }),
        }),
      }),
    }),
  }),
}))
const byRole = vi.fn()
vi.mock('./waitlist-counts', () => ({ waitingByRoleFor: (id: string) => byRole(id) }))

import { openMarketFor } from './open-market'

beforeEach(() => {
  tables.markets = [
    { slug: 'sacramento', is_open: true, metro_id: 'm-sac' },
    { slug: 'tahoe', is_open: false, metro_id: 'm-tahoe' },
  ]
  tables.metro_polygons = [
    { id: 'm-sac', slug: 'sacramento-roseville-ca', creator_threshold: 50, patron_threshold: 250 },
    { id: 'm-tahoe', slug: 'tahoe', creator_threshold: 100, patron_threshold: 1000 },
  ]
  byRole.mockReset()
})

describe('openMarketFor', () => {
  it('a waiting market: its name and both counts against their goals', async () => {
    byRole.mockResolvedValue({ makers: 12, supporters: 340 })
    expect(await openMarketFor('tahoe')).toEqual({
      key: 'tahoe',
      name: 'Lake Tahoe',
      open: false,
      makers: { count: 12, goal: 100 },
      supporters: { count: 340, goal: 1000 },
    })
    expect(byRole).toHaveBeenCalledWith('m-tahoe')
  })

  it('an open market says so', async () => {
    expect((await openMarketFor('sacramento'))?.open).toBe(true)
  })

  it('a county nobody has joined yet counts zero against the default goal, and writes nothing', async () => {
    const m = await openMarketFor('county-06115')
    expect(m).toMatchObject({ name: 'Yuba County, CA', open: false, makers: { count: 0, goal: 100 }, supporters: { count: 0, goal: 1000 } })
    expect(byRole).not.toHaveBeenCalled()
  })

  it('an unknown or malformed key is no market', async () => {
    expect(await openMarketFor('atlantis')).toBeNull()
    expect(await openMarketFor('../etc')).toBeNull()
  })
})

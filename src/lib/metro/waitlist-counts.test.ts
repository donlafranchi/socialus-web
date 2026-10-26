import { describe, it, expect, vi } from 'vitest'

// Inside unstable_cache the request-cookie client throws (Next: dynamic APIs
// cannot be read in a cached function). Bug #686 / #1030.
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => {
    throw new Error('cookies() called inside unstable_cache')
  },
}))
vi.mock('@/lib/supabase-anon', () => ({
  createAnonClient: () => ({
    from: () => ({
      select: async () => ({
        data: [
          { id: 'm1', creator_count: 3, patron_count: 4 },
          { id: 'm2', creator_count: 0, patron_count: 0 },
        ],
        error: null,
      }),
    }),
  }),
}))

import { waitingCountByMetro, waitingCountFor } from './waitlist-counts'

describe('waitlist counts read without request cookies', () => {
  it('loads every metro count with a cookie-free client', async () => {
    const m = await waitingCountByMetro()
    expect(m.get('m1')).toBe(7)
    expect(m.get('m2')).toBe(0)
  })
  it('gives one metro its count, null when absent', async () => {
    expect(await waitingCountFor('m1')).toBe(7)
    expect(await waitingCountFor('nope')).toBeNull()
  })
})

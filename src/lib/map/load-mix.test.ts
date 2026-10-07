import { describe, it, expect, vi } from 'vitest'

// bug #457 — logging what the map showed is fire-and-forget: it must never
// hold the page or exhaust the pool, and a failed log never fails the map.

const query = vi.fn()
vi.mock('@/actions/_lib/db', () => ({ getPool: () => ({ query }) }))
vi.mock('@/lib/feed/browse-feed', () => ({ getBrowseFeed: vi.fn(async () => []) }))
vi.mock('./mix', async (orig) => ({
  ...(await orig<typeof import('./mix')>()),
  buildMix: () => [{ bucket: 'new', resultKind: 'page', resultId: '0b000000-0000-4000-8000-000000000001' }],
}))

import { loadMapMix } from './load-mix'

const supabase = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  rpc: vi.fn(),
} as never

describe('loadMapMix', () => {
  it('returns the mix without waiting for the log', async () => {
    query.mockReturnValue(new Promise(() => {})) // never resolves
    const mix = await loadMapMix(supabase, '0c000000-0000-4000-8000-000000000001')
    expect(mix).toHaveLength(1)
    expect(query).toHaveBeenCalledTimes(1)
  })
  it('does not fail the map when the log fails', async () => {
    query.mockRejectedValue(new Error('EMAXCONNSESSION'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(loadMapMix(supabase, '0c000000-0000-4000-8000-000000000001')).resolves.toHaveLength(1)
    await new Promise((r) => setTimeout(r, 0))
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

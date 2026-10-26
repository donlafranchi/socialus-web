// #694 (F103.2, F103.3) — the zip is looked up once to one market. Nothing else decides it.

import { describe, it, expect, vi } from 'vitest'
import { marketForZip } from './zip-market'

interface Fake {
  key?: string | null
  name?: string | null
  market?: { is_open: boolean; metro_id: string | null } | null
  waitingMetro?: string | null
  fail?: 'key' | 'name' | 'market' | 'metro'
}

function client(f: Fake) {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === 'zip_market_key') return f.fail === 'key' ? { data: null, error: { message: 'x' } } : { data: f.key ?? null, error: null }
    if (fn === 'market_name') return f.fail === 'name' ? { data: null, error: { message: 'x' } } : { data: f.name ?? null, error: null }
    if (fn === 'market_metro') return f.fail === 'metro' ? { data: null, error: { message: 'x' } } : { data: f.waitingMetro ?? null, error: null }
    throw new Error(`unexpected rpc ${fn}`)
  })
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => (f.fail === 'market' ? { data: null, error: { message: 'x' } } : { data: f.market ?? null, error: null }) }) }),
  }))
  return { rpc, from } as never
}

describe('marketForZip', () => {
  // [guards F103.3 partial: an open market lets the person straight in, and its feed row is kept as home]
  it('a zip in an open market is open, with the row the feed reads', async () => {
    const got = await marketForZip(client({ key: 'sacramento', name: 'Sacramento', market: { is_open: true, metro_id: 'metro-sac' } }), '95746')
    expect(got).toEqual({ key: 'sacramento', name: 'Sacramento', open: true, metroId: 'metro-sac' })
  })

  // [guards F103.3 partial: a waiting market names itself and gets a row to wait on]
  it('a zip in a waiting market names it and carries the row to wait on', async () => {
    const got = await marketForZip(client({ key: 'county-06115', name: 'Yuba County, CA', market: null, waitingMetro: 'metro-yuba' }), '95901')
    expect(got).toEqual({ key: 'county-06115', name: 'Yuba County, CA', open: false, metroId: 'metro-yuba' })
  })

  it('a named waiting market (Tahoe) is waiting, not open', async () => {
    const got = await marketForZip(client({ key: 'tahoe', name: 'Lake Tahoe', market: { is_open: false, metro_id: 'metro-tahoe' }, waitingMetro: 'metro-tahoe' }), '96150')
    expect(got).toMatchObject({ open: false, name: 'Lake Tahoe' })
  })

  // [guards F103.2 partial: a zip the table does not know has no market, never a default or a nearest match]
  it('a zip nobody knows has no market', async () => {
    await expect(marketForZip(client({ key: null }), '00000')).resolves.toBeNull()
  })

  it.each(['key', 'name', 'market', 'metro'] as const)('a failed read of the %s has no market rather than a guess', async (fail) => {
    await expect(
      marketForZip(client({ key: 'county-06115', name: 'Yuba County, CA', market: null, waitingMetro: 'm', fail }), '95901'),
    ).resolves.toBeNull()
  })
})

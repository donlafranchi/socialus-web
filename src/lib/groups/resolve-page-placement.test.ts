import { describe, it, expect, vi, beforeEach } from 'vitest'

// T143 — the position resolver. Returns a LIST of typed placements, never
// a bare point, so a future appearance branch is an addition to the
// contract and not a rewrite of every caller (review binding note 9).

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('@/actions/_lib/db', () => ({ getPool: () => ({ query }) }))

import { resolvePagePlacements } from './resolve-page-placement'

beforeEach(() => {
  query.mockReset()
})

describe('resolvePagePlacements — no anchor', () => {
  it('returns an empty list when the Page has no anchor Location', async () => {
    query.mockResolvedValueOnce({ rows: [] })
    const result = await resolvePagePlacements('group-1')
    expect(result).toEqual([])
  })
})

describe('resolvePagePlacements — address anchor', () => {
  it('returns exactly one point placement, source anchor, labelled with the resolved address', async () => {
    query.mockResolvedValueOnce({
      rows: [{ kind: 'permanent', description: '123 Main St, Sacramento, CA', lng: -121.5, lat: 38.58, place_name: null }],
    })

    const result = await resolvePagePlacements('group-1')

    expect(result).toEqual([
      { source: 'anchor', kind: 'point', label: '123 Main St, Sacramento, CA', lng: -121.5, lat: 38.58 },
    ])
  })
})

describe('resolvePagePlacements — neighbourhood anchor', () => {
  it('returns exactly one area placement, source anchor, labelled with the neighbourhood Place name', async () => {
    query.mockResolvedValueOnce({ rows: [{ kind: 'area', description: null, lng: -121.48, lat: 38.57, place_name: 'Midtown' }] })

    const result = await resolvePagePlacements('group-1')

    expect(result).toEqual([
      { source: 'anchor', kind: 'area', label: 'Midtown', lng: -121.48, lat: 38.57 },
    ])
  })

  it('is identified by its Place name, not a bare coordinate', async () => {
    query.mockResolvedValueOnce({ rows: [{ kind: 'area', description: null, lng: -121.48, lat: 38.57, place_name: 'Midtown' }] })

    const [placement] = await resolvePagePlacements('group-1')
    expect(placement!.label).not.toMatch(/-?\d+\.\d+/)
  })
})

describe('resolvePagePlacements — #978 one round trip', () => {
  it('asks the database once, whatever the anchor', async () => {
    query.mockResolvedValue({ rows: [{ kind: 'area', description: null, lng: -121.48, lat: 38.57, place_name: 'Midtown' }] })
    await resolvePagePlacements('group-1')
    expect(query).toHaveBeenCalledTimes(1)
  })
})

describe('resolvePagePlacements — contract', () => {
  it('always returns an array (a list), never a bare object — the appearances contract this function must not break', async () => {
    query.mockResolvedValueOnce({ rows: [] })
    const result = await resolvePagePlacements('group-1')
    expect(Array.isArray(result)).toBe(true)
    // @ts-expect-error — a caller destructuring a single placement instead
    // of iterating the list is exactly the contract violation this
    // ticket exists to prevent; this line must not type-check.
    const _wrongShape: { source: string } = result
    void _wrongShape
  })
})

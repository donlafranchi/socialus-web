import { describe, it, expect, vi, beforeEach } from 'vitest'

// T142 — the location-create action stops inventing a coordinate. Every
// caller must supply either a geocoded address or a chosen neighbourhood;
// there is no longer a default/placeholder/city-centroid fallback.

const { getUser, query } = vi.hoisted(() => ({
  getUser: vi.fn(),
  query: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

vi.mock('@/actions/_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (client: { query: typeof query }) => unknown) =>
    fn({ query }),
  ),
}))

import { sellCreateLocationAction, sellListNeighborhoodsAction } from './actions'

const MEMBER = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  getUser.mockReset()
  query.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: MEMBER } }, error: null })
})

describe('sellCreateLocationAction — address mode', () => {
  it('inserts with the given geography, kind permanent, and never falls back to a placeholder point', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'loc-1', label: 'Home' }] })

    const result = await sellCreateLocationAction({
      label: 'Home',
      address: {
        geographyWkt: 'SRID=4326;POINT(-121.5 38.6)',
        resolvedAddressText: '123 Main St, Sacramento, CA',
      },
    })

    expect(result).toEqual({ id: 'loc-1', label: 'Home' })
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/insert into public\.locations/i)
    expect(params).toContain('permanent')
    expect(params).toContain('SRID=4326;POINT(-121.5 38.6)')
    // The deleted constant must never appear anywhere in the call.
    expect(params.join(' ')).not.toContain('-121.4944 38.5816')
  })
})

describe('sellCreateLocationAction — neighbourhood mode', () => {
  it('derives an interior point from the neighbourhood bbox and inserts kind=area', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ min_lng: -121.5, min_lat: 38.55, max_lng: -121.45, max_lat: 38.6 }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'loc-2', label: 'Run Club' }] })

    const result = await sellCreateLocationAction({
      label: 'Run Club',
      neighborhoodId: 'nbhd-midtown',
    })

    expect(result).toEqual({ id: 'loc-2', label: 'Run Club' })
    expect(query).toHaveBeenCalledTimes(2)

    const [bboxSql, bboxParams] = query.mock.calls[0]
    expect(bboxSql).toMatch(/st_xmin|st_ymin|st_xmax|st_ymax/i)
    expect(bboxParams).toEqual(['nbhd-midtown'])

    const [insertSql, insertParams] = query.mock.calls[1]
    expect(insertSql).toMatch(/insert into public\.locations/i)
    expect(insertParams).toContain('area')
    const wkt = insertParams.find((p: unknown) => typeof p === 'string' && p.startsWith('SRID=4326'))
    expect(wkt).toBeDefined()
    // The derived point must land inside the given bbox.
    const match = (wkt as string).match(/POINT\(([-\d.]+) ([-\d.]+)\)/)
    expect(match).not.toBeNull()
    const [, lngStr, latStr] = match!
    expect(Number(lngStr)).toBeGreaterThanOrEqual(-121.5)
    expect(Number(lngStr)).toBeLessThanOrEqual(-121.45)
    expect(Number(latStr)).toBeGreaterThanOrEqual(38.55)
    expect(Number(latStr)).toBeLessThanOrEqual(38.6)
  })

  it('refuses when the neighbourhood cannot be found', async () => {
    query.mockResolvedValueOnce({ rows: [] })
    await expect(
      sellCreateLocationAction({ label: 'Run Club', neighborhoodId: 'does-not-exist' }),
    ).rejects.toMatchObject({ code: 'neighborhood_not_found' })
  })
})

describe('sellCreateLocationAction — refuses a placement-less call at runtime', () => {
  it('throws rather than writing a row when neither address nor neighborhoodId is present', async () => {
    // TypeScript's discriminated union prevents this at compile time; this
    // guards the same invariant at runtime, since a server action is a
    // callable network endpoint and types don't survive past the client.
    const input = { label: 'Oops' } as unknown as Parameters<typeof sellCreateLocationAction>[0]
    await expect(sellCreateLocationAction(input)).rejects.toMatchObject({
      code: 'location_needs_place',
    })
    expect(query).not.toHaveBeenCalled()
  })
})

describe('sellListNeighborhoodsAction', () => {
  it('returns id/name/slug for every neighbourhood place', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'n1', display_name: 'Midtown', slug: 'midtown' },
        { id: 'n2', display_name: 'Oak Park', slug: 'oak-park' },
      ],
    })
    const result = await sellListNeighborhoodsAction()
    expect(result).toEqual([
      { id: 'n1', name: 'Midtown', slug: 'midtown' },
      { id: 'n2', name: 'Oak Park', slug: 'oak-park' },
    ])
    const [sql] = query.mock.calls[0]
    expect(sql).toMatch(/kind\s*=\s*'neighborhood'/i)
  })
})

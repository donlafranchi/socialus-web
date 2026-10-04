import { describe, it, expect, vi, beforeEach } from 'vitest'

// Issue #180 — a member-created Location knows which Place it is in.
//
// The second half of #175. `locations.place_id` was added by T075 with a
// comment saying its population would land in a later ticket, and it never
// did: the only insert in the tree wrote six columns and not that one. The
// canonical Page URL no longer needs it, but breadcrumbs, place scoping and
// `browse_feed`'s `place_path` still do.
//
// WHICH PLACE WINS: the deepest containing one, smallest area on a tie. That
// is already ruled (#175) and already implemented — `public.place_for_coords`
// orders by `ST_Area` ascending and takes one. This reuses it rather than
// writing a second answer to the same question.

const { getUser, query } = vi.hoisted(() => ({ getUser: vi.fn(), query: vi.fn() }))

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}))
vi.mock('@/actions/_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
}))

import { createLocationAction } from './location-actions'

const MEMBER = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  getUser.mockReset()
  query.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: MEMBER } }, error: null })
})

describe('a new Location records the Place it falls in', () => {
  it('writes place_id on the insert', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'loc-1', label: 'Home', place_id: 'pl-1' }] })
    await createLocationAction({
      label: 'Home',
      address: {
        geographyWkt: 'SRID=4326;POINT(-121.5 38.6)',
        resolvedAddressText: '123 Main St, Sacramento, CA',
      },
    })
    const [sql] = query.mock.calls[0]
    expect(sql).toMatch(/insert into public\.locations/i)
    expect(sql).toMatch(/place_id/)
  })

  it('resolves it through place_for_coords rather than a second rule of its own', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'loc-1', label: 'Home', place_id: 'pl-1' }] })
    await createLocationAction({
      label: 'Home',
      address: {
        geographyWkt: 'SRID=4326;POINT(-121.5 38.6)',
        resolvedAddressText: '123 Main St',
      },
    })
    const [sql] = query.mock.calls[0]
    expect(sql).toMatch(/place_for_coords/i)
  })

  it('reads the point off the geography being written, not off a second parameter', async () => {
    // A second parameter is a second chance to disagree with the column.
    query.mockResolvedValueOnce({ rows: [{ id: 'loc-1', label: 'Home', place_id: null }] })
    await createLocationAction({
      label: 'Home',
      address: { geographyWkt: 'SRID=4326;POINT(-121.5 38.6)', resolvedAddressText: 'x' },
    })
    const [sql, params] = query.mock.calls[0]
    // The seventh is the place an owner picked (#348): null for an address,
    // and never a coordinate.
    expect(params).toHaveLength(7)
    expect(params[6]).toBeNull()
    expect(sql).toMatch(/st_y\(/i)
    expect(sql).toMatch(/st_x\(/i)
  })

  it('does it in one statement — no extra round trip per Location', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'loc-1', label: 'Home', place_id: 'pl-1' }] })
    await createLocationAction({
      label: 'Home',
      address: { geographyWkt: 'SRID=4326;POINT(-121.5 38.6)', resolvedAddressText: 'x' },
    })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('still creates the Location when no polygon covers the point', async () => {
    // A point outside every Place costs the Location its breadcrumb, never the
    // Location. `place_for_coords` returns zero rows there, which is null.
    query.mockResolvedValueOnce({ rows: [{ id: 'loc-1', label: 'Home', place_id: null }] })
    const r = await createLocationAction({
      label: 'Home',
      address: { geographyWkt: 'SRID=4326;POINT(0 0)', resolvedAddressText: 'nowhere' },
    })
    expect(r).toEqual({ ok: true, data: { id: 'loc-1', label: 'Home' } })
  })

  it('records it for a neighbourhood-mode Location too', async () => {
    query.mockResolvedValueOnce({
      rows: [{ min_lng: -121.6, min_lat: 38.5, max_lng: -121.4, max_lat: 38.7 }],
    })
    query.mockResolvedValueOnce({ rows: [{ id: 'loc-2', label: 'Oak Park', place_id: 'pl-9' }] })
    await createLocationAction({ label: 'Oak Park', neighborhoodId: 'pl-9' })
    const [sql] = query.mock.calls[1]
    expect(sql).toMatch(/place_for_coords/i)
  })
})

// Don, 2026-10-04: a neighbourhood has a centre point for its pin, and an
// owner who picks a neighbourhood gets that pin, not a random spot.
describe('#348 — a neighbourhood Location pins at the neighbourhood centre', () => {
  it('writes the place centre as the point', async () => {
    query.mockResolvedValueOnce({
      rows: [{ min_lng: -121.6, min_lat: 38.5, max_lng: -121.4, max_lat: 38.7, centre_lng: -121.47, centre_lat: 38.55 }],
    })
    query.mockResolvedValueOnce({ rows: [{ id: 'loc-3', label: 'Curtis Park', place_id: 'pl-7' }] })
    await createLocationAction({ label: 'Curtis Park', neighborhoodId: 'pl-7' })
    const [, params] = query.mock.calls[1] as [string, unknown[]]
    expect(params[4]).toBe('SRID=4326;POINT(-121.47 38.55)')
  })

  it('falls back to a point inside the shape when a place has no centre', async () => {
    query.mockResolvedValueOnce({
      rows: [{ min_lng: -121.6, min_lat: 38.5, max_lng: -121.4, max_lat: 38.7, centre_lng: null, centre_lat: null }],
    })
    query.mockResolvedValueOnce({ rows: [{ id: 'loc-4', label: 'Somewhere', place_id: 'pl-8' }] })
    await createLocationAction({ label: 'Somewhere', neighborhoodId: 'pl-8' })
    const [, params] = query.mock.calls[1] as [string, unknown[]]
    expect(params[4]).toMatch(/^SRID=4326;POINT\(-121\.\d+ 38\.\d+\)$/)
  })
})

// #348 review: picking the town "Sacramento" showed visitors "East Sacramento",
// because the town's centre falls inside one of its neighbourhoods and the
// place was derived from the point. A picked place is the place.
describe('#348 — a picked town or neighbourhood is the place recorded', () => {
  it('records the picked place, not the smallest one under its pin', async () => {
    query.mockResolvedValueOnce({
      rows: [{ min_lng: -121.6, min_lat: 38.4, max_lng: -121.3, max_lat: 38.7, centre_lng: -121.44, centre_lat: 38.57 }],
    })
    query.mockResolvedValueOnce({ rows: [{ id: 'loc-5', label: 'Sacramento', place_id: 'pl-sac' }] })
    await createLocationAction({ label: 'Sacramento', neighborhoodId: 'pl-sac' })
    const [sql, params] = query.mock.calls[1] as [string, unknown[]]
    expect(params).toContain('pl-sac')
    expect(sql).toMatch(/coalesce\(\s*\$7/i)
  })

  it('an address still takes its place from the point', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'loc-6', label: 'Shop', place_id: 'pl-x' }] })
    await createLocationAction({ label: 'Shop', address: { geographyWkt: 'SRID=4326;POINT(-121.49 38.58)', resolvedAddressText: '915 I St' } } as never)
    const [, params] = query.mock.calls[0] as [string, unknown[]]
    expect(params[6]).toBeNull()
  })
})

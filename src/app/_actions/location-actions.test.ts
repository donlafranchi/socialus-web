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
    expect(params).toHaveLength(6)
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

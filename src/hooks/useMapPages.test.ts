import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rowsToMapPages, withinBounds, type MapPageRow } from './useMapPages'

// The map showed nothing, and had never shown anything.
//
// `useMapBusinesses` queried `.from('businesses')` — a table that does not
// exist and never did (confirmed in #94 when the vendor funnel came out). The
// query failed silently, `setBusinesses` was never called, and the map rendered
// an empty basemap. Pages live in `groups`, pinned through
// `anchor_location_id → locations.geography`.
//
// Which Pages belong on the map is not this module's call — it asks
// `kind-controls`, per Don's ruling that a control belongs to the Page kind.

const point = (lng: number, lat: number) => {
  // EWKB hex for SRID 4326 POINT, little-endian — the shape PostgREST returns
  // for a geography column, and what decodeEwkbPoint already parses elsewhere.
  const buf = Buffer.alloc(25)
  buf.writeUInt8(1, 0)
  buf.writeUInt32LE(0x20000001, 1)
  buf.writeUInt32LE(4326, 5)
  buf.writeDoubleLE(lng, 9)
  buf.writeDoubleLE(lat, 17)
  return buf.toString('hex')
}

const row = (over: Partial<MapPageRow> = {}): MapPageRow => ({
  id: 'g1',
  name: 'Clara’s Kitchen',
  slug: 'claras-kitchen',
  public_id: '7k3x8m',
  kind: 'business',
  category: 'bakery',
  photo_url: null,
  photo_hidden_at: null,
  photo_hide_locked_url: null,
  anchor: { label: 'Oak Park', geography: point(-121.47, 38.55) },
  ...over,
})

describe('rowsToMapPages', () => {
  it('turns a group row into a pinned Page', () => {
    const [p] = rowsToMapPages([row()])
    expect(p).toMatchObject({
      id: 'g1',
      name: 'Clara’s Kitchen',
      slug: 'claras-kitchen',
      locationLabel: 'Oak Park',
    })
    expect(p.longitude).toBeCloseTo(-121.47, 5)
    expect(p.latitude).toBeCloseTo(38.55, 5)
  })

  // CORRECTED alongside kind-controls: the ratified mapping in ops-pattern
  // `product/systems/page-kind-tools.md` gives interest and practice a Location
  // anchor. A run club meets somewhere. `family` is the only ✕ — it is the
  // community set with privacy on, so nothing it has is public.
  it('pins a community kind, which has a place like any other social group', () => {
    expect(rowsToMapPages([row({ kind: 'interest' })])).toHaveLength(1)
    expect(rowsToMapPages([row({ kind: 'practice' })])).toHaveLength(1)
  })

  it('drops family, whose whole difference is that nothing of it is public', () => {
    expect(rowsToMapPages([row({ kind: 'family' })])).toEqual([])
  })

  it('drops a kind it does not recognise, rather than pinning it by default', () => {
    expect(rowsToMapPages([row({ kind: 'something_new' })])).toEqual([])
  })

  it('drops a Page with no anchor, rather than pinning it at null island', () => {
    expect(rowsToMapPages([row({ anchor: null })])).toEqual([])
  })

  it('drops a Page whose point will not decode, and keeps the others', () => {
    const out = rowsToMapPages([row({ id: 'bad', anchor: { label: 'x', geography: 'nonsense' } }), row()])
    expect(out.map((p) => p.id)).toEqual(['g1'])
  })

  it('respects the photo hide — a hidden photo does not reach the map', () => {
    const [p] = rowsToMapPages([row({ photo_url: 'https://x/a.webp', photo_hidden_at: '2026-09-16T00:00:00Z' })])
    expect(p.photoUrl).toBeNull()
  })

  it('carries a visible photo through', () => {
    const [p] = rowsToMapPages([row({ photo_url: 'https://x/a.webp' })])
    expect(p.photoUrl).toBe('https://x/a.webp')
  })
})

describe('withinBounds', () => {
  const b = { north: 39, south: 38, east: -121, west: -122 }

  it('keeps a point inside', () => {
    expect(withinBounds({ longitude: -121.5, latitude: 38.5 }, b)).toBe(true)
  })

  it('drops a point outside', () => {
    expect(withinBounds({ longitude: -120, latitude: 38.5 }, b)).toBe(false)
    expect(withinBounds({ longitude: -121.5, latitude: 40 }, b)).toBe(false)
  })

  it('keeps everything when there are no bounds', () => {
    expect(withinBounds({ longitude: 0, latitude: 0 }, null)).toBe(true)
  })

  it('drops a point with no coordinates', () => {
    expect(withinBounds({ longitude: null, latitude: 38.5 }, b)).toBe(false)
  })
})

// Issue #175 — the pin links off the groups row itself. It used to need a
// second read through `locations.place_id`, which is null for every Page a
// member created, so every one of those pins was a dead pin.
describe('the pin links to the Page', () => {
  it('builds the canonical address from the row, with no second read', () => {
    const [p] = rowsToMapPages([row()])
    expect(p.href).toBe('/g/claras-kitchen-7k3x8m')
  })

  it('carries no place path — the address survives a move from metros to neighbourhoods', () => {
    const [p] = rowsToMapPages([row()])
    expect(p.href).not.toMatch(/^\/p\//)
  })

  it('loses the link, never the pin, when there is no id to resolve by', () => {
    const [p] = rowsToMapPages([row({ public_id: null })])
    expect(p.href).toBeNull()
    expect(p.latitude).toBeDefined()
  })
})

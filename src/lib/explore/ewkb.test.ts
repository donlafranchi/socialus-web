// T117 — PostGIS EWKB point decoding for Explore map pins.

import { describe, it, expect } from 'vitest'
import { decodeEwkbPoint } from './ewkb'

// Real rows from the seeded `locations` table, as PostgREST serializes
// geography(Point,4326): little-endian, SRID-flagged, hex.
const GOOD_MARKET = '0101000020E6100000C3F5285C8F7A5EC0713D0AD7A3A04340'
const POND_SIDE = '0101000020E6100000713D0AD7A3785EC0713D0AD7A3A04340'

describe('T117 — decodeEwkbPoint', () => {
  it('decodes a little-endian SRID-flagged point', () => {
    const p = decodeEwkbPoint(GOOD_MARKET)
    expect(p).not.toBeNull()
    expect(p!.longitude).toBeCloseTo(-121.915, 6)
    expect(p!.latitude).toBeCloseTo(39.255, 6)
  })

  it('decodes a second distinct point', () => {
    const p = decodeEwkbPoint(POND_SIDE)
    expect(p!.longitude).toBeCloseTo(-121.885, 6)
    expect(p!.latitude).toBeCloseTo(39.255, 6)
  })

  it('accepts lowercase hex', () => {
    expect(decodeEwkbPoint(GOOD_MARKET.toLowerCase())!.longitude).toBeCloseTo(-121.915, 6)
  })

  it('decodes a point with no SRID flag', () => {
    // WKB (not EWKB): endian + type 1, then the two doubles.
    const noSrid = '0101000000' + GOOD_MARKET.slice(18)
    const p = decodeEwkbPoint(noSrid)
    expect(p!.longitude).toBeCloseTo(-121.915, 6)
  })

  it('decodes a big-endian point', () => {
    // 00 + type 1 (BE) + lon/lat as big-endian doubles for (-121.915, 39.255).
    const be = '0000000001' + 'C05E7A8F5C28F5C3' + '4043A0A3D70A3D71'
    const p = decodeEwkbPoint(be)
    expect(p!.longitude).toBeCloseTo(-121.915, 6)
    expect(p!.latitude).toBeCloseTo(39.255, 6)
  })

  it('returns null for null, empty, and non-hex input', () => {
    expect(decodeEwkbPoint(null)).toBeNull()
    expect(decodeEwkbPoint(undefined)).toBeNull()
    expect(decodeEwkbPoint('')).toBeNull()
    expect(decodeEwkbPoint('not-hex-at-all')).toBeNull()
    expect(decodeEwkbPoint('0101000020E610000')).toBeNull() // odd length
  })

  it('rejects hex with a non-hex character rather than coercing it to zero', () => {
    // parseInt('0z', 16) is 0, not NaN — a per-byte parse would accept this.
    expect(decodeEwkbPoint('0z' + '0101000020E6100000C3F5285C8F7A5EC0713D0AD7A3A043')).toBeNull()
    expect(decodeEwkbPoint('0101000020E6100000C3F5285C8F7A5EC0713D0AD7A3A043zz')).toBeNull()
  })

  it('returns null for a truncated point', () => {
    expect(decodeEwkbPoint(GOOD_MARKET.slice(0, 30))).toBeNull()
  })

  it('returns null for a non-point geometry', () => {
    // type 3 = Polygon.
    expect(decodeEwkbPoint('0103000020E6100000' + GOOD_MARKET.slice(18))).toBeNull()
  })

  it('returns null for out-of-range coordinates', () => {
    // lon = 1e6.
    const bad = '0101000020E6100000' + '0000000080842E41' + GOOD_MARKET.slice(34)
    expect(decodeEwkbPoint(bad)).toBeNull()
  })
})

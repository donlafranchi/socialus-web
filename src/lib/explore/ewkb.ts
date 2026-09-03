// T117 — PostGIS EWKB point decoding.
//
// PostgREST serializes `geography(Point,4326)` as hex EWKB; there is no
// PostgREST-readable lat/lng on `discoverable_items` or on `locations` (see the
// header of `032_venue_distance.sql`). Explore's map pins need coordinates, so
// they are decoded here rather than by a fourth drop-and-rebuild of the MV.
//
// Layout: 1 byte endianness (00 big / 01 little), uint32 type, optional uint32
// SRID when the type carries the 0x20000000 EWKB flag, then two float64s —
// X (longitude) and Y (latitude).

export interface LngLat {
  longitude: number
  latitude: number
}

const SRID_FLAG = 0x20000000
const POINT = 1
const HEADER_BYTES = 5
const POINT_BYTES = 16

const HEX_ONLY = /^[0-9a-fA-F]+$/

function hexToBytes(hex: string): Uint8Array | null {
  // The whole-string test matters: parseInt('0z', 16) returns 0, not NaN, so a
  // per-byte parse would silently accept malformed input as a valid coordinate.
  if (hex.length === 0 || hex.length % 2 !== 0 || !HEX_ONLY.test(hex)) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/** Decode a hex EWKB/WKB Point. Returns null for anything else. */
export function decodeEwkbPoint(hex: string | null | undefined): LngLat | null {
  if (!hex) return null
  const bytes = hexToBytes(hex.trim())
  if (!bytes || bytes.length < HEADER_BYTES + POINT_BYTES) return null

  const endian = bytes[0]
  if (endian !== 0 && endian !== 1) return null
  const little = endian === 1

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const type = view.getUint32(1, little)
  if ((type & 0xff) !== POINT) return null

  const offset = HEADER_BYTES + ((type & SRID_FLAG) !== 0 ? 4 : 0)
  if (bytes.length < offset + POINT_BYTES) return null

  const longitude = view.getFloat64(offset, little)
  const latitude = view.getFloat64(offset + 8, little)
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null

  return { longitude, latitude }
}

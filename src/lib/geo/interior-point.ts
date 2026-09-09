export interface BBox {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

// FNV-1a, 32-bit. Not cryptographic — this only needs to be deterministic
// and well-distributed, not unpredictable.
function hashToUnitFloat(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 0xffffffff
}

// A point derived from `seed`, drawn toward the interior of `bbox` rather
// than uniformly across it (review binding note 7 — the seeded
// neighbourhood polygons are hand-drawn rectangles, so a uniform-random
// point can land in the river or across a boundary). `shrink` (0-1) sets
// how far the draw range contracts toward the bbox center; 0 collapses to
// the exact center, 1 reproduces a uniform draw across the full box.
export function deriveInteriorPoint(seed: string, bbox: BBox, shrink = 0.6): { lng: number; lat: number } {
  const fx = hashToUnitFloat(`${seed}:lng`)
  const fy = hashToUnitFloat(`${seed}:lat`)
  const width = bbox.maxLng - bbox.minLng
  const height = bbox.maxLat - bbox.minLat
  const centerLng = (bbox.minLng + bbox.maxLng) / 2
  const centerLat = (bbox.minLat + bbox.maxLat) / 2
  return {
    lng: centerLng + (fx - 0.5) * width * shrink,
    lat: centerLat + (fy - 0.5) * height * shrink,
  }
}

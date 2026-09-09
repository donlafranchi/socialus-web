import { describe, it, expect } from 'vitest'
import { deriveInteriorPoint } from './interior-point'

// T142 — a neighbourhood-mode Location needs a point that is deterministic
// (same seed -> same point, forever) and drawn toward the polygon's
// interior rather than uniformly across its bounding box (F061 review
// binding note 7 — the five seeded polygons are hand-drawn rectangles, so
// a uniform-random point can land in the river).

const BBOX = { minLng: -121.5, minLat: 38.55, maxLng: -121.45, maxLat: 38.6 }

describe('deriveInteriorPoint', () => {
  it('is deterministic — the same seed always produces the same point', () => {
    const a = deriveInteriorPoint('group-123', BBOX)
    const b = deriveInteriorPoint('group-123', BBOX)
    expect(a).toEqual(b)
  })

  it('produces different points for different seeds (no collision on adjacent ids)', () => {
    const a = deriveInteriorPoint('group-123', BBOX)
    const b = deriveInteriorPoint('group-124', BBOX)
    expect(a).not.toEqual(b)
  })

  it('stays within the bounding box', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', crypto.randomUUID(), crypto.randomUUID()]) {
      const p = deriveInteriorPoint(seed, BBOX)
      expect(p.lng).toBeGreaterThanOrEqual(BBOX.minLng)
      expect(p.lng).toBeLessThanOrEqual(BBOX.maxLng)
      expect(p.lat).toBeGreaterThanOrEqual(BBOX.minLat)
      expect(p.lat).toBeLessThanOrEqual(BBOX.maxLat)
    }
  })

  it('is drawn toward the interior, not spread uniformly across the full bounding box', () => {
    // With the default shrink factor, every point should land within a
    // strictly smaller box centered on the bbox — never at or past the
    // true edges the way a uniform draw eventually would.
    const margin = { lng: (BBOX.maxLng - BBOX.minLng) * 0.19, lat: (BBOX.maxLat - BBOX.minLat) * 0.19 }
    for (let i = 0; i < 20; i++) {
      const p = deriveInteriorPoint(`seed-${i}`, BBOX)
      expect(p.lng).toBeGreaterThan(BBOX.minLng + margin.lng)
      expect(p.lng).toBeLessThan(BBOX.maxLng - margin.lng)
      expect(p.lat).toBeGreaterThan(BBOX.minLat + margin.lat)
      expect(p.lat).toBeLessThan(BBOX.maxLat - margin.lat)
    }
  })

  it('centers on the bounding box center when shrink is 0', () => {
    const p = deriveInteriorPoint('any-seed', BBOX, 0)
    expect(p.lng).toBeCloseTo((BBOX.minLng + BBOX.maxLng) / 2, 6)
    expect(p.lat).toBeCloseTo((BBOX.minLat + BBOX.maxLat) / 2, 6)
  })
})

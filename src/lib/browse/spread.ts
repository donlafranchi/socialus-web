// #475 — pins at one address are spread apart, in screen space, so each can be
// tapped. Pins already further apart than SPREAD_GAP are left exactly where they are.

export interface SpreadPoint {
  key: string
  x: number
  y: number
}

/** Centre-to-centre distance below which two pins count as the same spot. */
export const SPREAD_GAP = 20

export function spreadCoincident<T extends SpreadPoint>(points: readonly T[]): T[] {
  const out = points.map((p) => ({ ...p }))
  const seen = new Set<number>()
  for (let i = 0; i < points.length; i++) {
    if (seen.has(i)) continue
    const group = [i]
    for (let j = i + 1; j < points.length; j++) {
      if (!seen.has(j) && Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y) < SPREAD_GAP) group.push(j)
    }
    if (group.length < 2) continue
    group.forEach((g) => seen.add(g))
    const cx = group.reduce((s, g) => s + points[g]!.x, 0) / group.length
    const cy = group.reduce((s, g) => s + points[g]!.y, 0) / group.length
    // Neighbours on the ring must be at least SPREAD_GAP apart: chord = 2r·sin(π/n).
    const r = group.length === 2 ? SPREAD_GAP / 2 + 1 : (SPREAD_GAP + 1) / (2 * Math.sin(Math.PI / group.length))
    group.forEach((g, k) => {
      const a = (2 * Math.PI * k) / group.length - Math.PI / 2
      out[g]!.x = cx + r * Math.cos(a)
      out[g]!.y = cy + r * Math.sin(a)
    })
  }
  return out
}

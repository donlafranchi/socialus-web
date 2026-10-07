// #331 — pins close together on screen become one cluster when zoomed out
// (Google Maps, Airbnb). Screen-space grid: points in the same cell group.

export interface ScreenPoint {
  key: string
  x: number
  y: number
}

export interface Cluster {
  keys: string[]
}

export function gridCluster(points: readonly ScreenPoint[], cell = 56): Cluster[] {
  const cells = new Map<string, string[]>()
  for (const p of points) {
    const k = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`
    cells.set(k, [...(cells.get(k) ?? []), p.key])
  }
  return [...cells.values()].map((keys) => ({ keys }))
}

// #922 (Don, 2026-10-18) — how far Explore reaches. The database picks the smallest 15-minute ring holding a
// full screen (browse_nearby); these are the member's choices on top of it and the line that says which one.

/** The rings, in minutes' drive. The last is the cap the widening stops at. */
export const REACH_RINGS = [15, 30, 45, 60] as const
export const REACH_CAP = REACH_RINGS[REACH_RINGS.length - 1]
/** About a full phone screen of things on this week. */
export const REACH_TARGET = 24

/** A ring, or the whole area (past the cap: the member asked). */
export type Reach = number | 'all'

/** `?reach=` — a ring, or 'all'; anything else is no choice (the database picks). */
export function parseReach(v: string | null | undefined): Reach | null {
  if (v === 'all') return 'all'
  const n = Number(v)
  return (REACH_RINGS as readonly number[]).includes(n) ? n : null
}

export const REACH_OPTIONS: { value: Reach; label: string }[] = [
  ...REACH_RINGS.map((n) => ({ value: n as Reach, label: n === 60 ? '1 hour' : `${n} minutes` })),
  { value: 'all', label: 'Whole area' },
]

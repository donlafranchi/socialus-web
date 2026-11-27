// F081 ruling 2026-11-25 (the PM): "a visitor doesn't pick a metro unless they're in between metros. for now
// they should be within an hour of an open metro to be admitted." So, for someone with no market of their own:
//   - within an hour of one open market: they are in it (with a way to change it);
//   - within an hour of several: they choose from those;
//   - beyond an hour of all: the waitlist (F076);
//   - no location to go on: F059 criterion 6 — the one open market while exactly one is open, else they choose.
//
// "Within an hour" is measured as the crow flies, because there is no drive-time service here: inside the
// market's own boundary, or within ADMIT_REACH_MILES of its centre. Roads run about 1.3x the straight line,
// so 45 miles is roughly an hour's drive at 55-60 mph.
// Known limit: outside the boundary, distance is to the market's centre, not its edge, so a visitor just past
// a large market's boundary but far from its centre is not admitted. Measuring to the edge needs a database function.

import type { FeedMetro } from '@/lib/feed/feed-metro'

export const ADMIT_REACH_MILES = 45

export type Admission =
  | { kind: 'one'; metro: FeedMetro }
  | { kind: 'several'; metros: FeedMetro[] }
  | { kind: 'far' }
  | { kind: 'unknown' }

const EARTH_MILES = 3958.8
const rad = (d: number) => (d * Math.PI) / 180

/** Great-circle distance in miles between two [lng, lat] points. */
export function milesBetween([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Which open markets a visitor at `point` is admitted to, nearest first.
 * `containingMetroId` is the market whose boundary holds the point (resolve_home_metro), when one does.
 */
export function admitVisitor(
  point: [number, number] | null,
  metros: readonly FeedMetro[],
  containingMetroId: string | null = null,
): Admission {
  if (!point) return { kind: 'unknown' }
  const near = metros
    .filter((m) => m.isOpen)
    .map((m) => ({ m, miles: m.id === containingMetroId ? 0 : m.center ? milesBetween(point, m.center) : Infinity }))
    .filter((x) => x.miles <= ADMIT_REACH_MILES)
    .sort((a, b) => a.miles - b.miles)
    .map((x) => x.m)
  if (near.length === 0) return { kind: 'far' }
  if (near.length === 1) return { kind: 'one', metro: near[0]! }
  return { kind: 'several', metros: near }
}

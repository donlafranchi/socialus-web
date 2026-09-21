// T156 — grouping browse results into map pins.
//
// NEW WORK, NOT A PORT. The Item map put one pin per Item and needed no
// grouping. Under the Page model a Page appears at its own location *and* each
// of its posts appears at the post's own address, so **one Page can produce
// several pins** — and several rows of the same Page at the same address must
// still produce one. The retired note that "one Page is one place, which is
// why the map needs no cross-location grouping" is void.
//
// The key is the Page plus the place, never the Page alone: collapsing to the
// Page would drop a market's Saturday stall at a different address, which is
// exactly the thing someone opens the map to find.
//
// Rows with no point are dropped rather than pinned at a fallback coordinate —
// `surfaces.md`: "no pin, no fallback coordinate". A guessed pin is a wrong
// answer that looks like a right one.

import type { BrowseResult } from '@/lib/feed/browse-feed'

export interface BrowsePin {
  /** Stable across renders: the Page and the place, not the array index. */
  key: string
  longitude: number
  latitude: number
  groupId: string
  /** The Page's name — what the pin is labelled with. */
  name: string
  href: string | null
  /** Every result at this Page-and-place, in the order the server returned. */
  results: BrowseResult[]
}

/** Six decimals is ~0.1m — finer than any two distinct addresses. */
function placeKey(r: BrowseResult): string {
  if (r.locationId) return r.locationId
  return `${r.longitude!.toFixed(6)},${r.latitude!.toFixed(6)}`
}

export function groupPins(results: readonly BrowseResult[]): BrowsePin[] {
  const pins = new Map<string, BrowsePin>()

  for (const r of results) {
    if (r.longitude == null || r.latitude == null) continue
    const key = `${r.groupId}@${placeKey(r)}`
    const existing = pins.get(key)
    if (existing) {
      existing.results.push(r)
      continue
    }
    pins.set(key, {
      key,
      longitude: r.longitude,
      latitude: r.latitude,
      groupId: r.groupId,
      name: r.name,
      href: r.href,
      results: [r],
    })
  }

  return [...pins.values()]
}

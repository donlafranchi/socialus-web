// One list of things a person can pick as "where is it".
//
// Two sources, deliberately unequal:
//   * `places` — ours, seeded, publicly readable, needs no token.
//   * Mapbox   — addresses only, and production has shipped without a token.
//
// Ours come first: they are the half that always works, and they are what
// someone vague about their location is usually after. That ordering is also
// what makes a missing Mapbox token degrade the field rather than block it.

import type { GeocodingResult } from '@/lib/geocoding'

export type Suggestion =
  | { source: 'address'; kind: 'address'; label: string; sublabel: string | null; address: GeocodingResult }
  | { source: 'place'; kind: string; label: string; sublabel: string | null; placeId: string }

/** Ours first, then addresses, capped so the list stays scannable. */
export function mergeMatches(places: Suggestion[], addresses: Suggestion[]): Suggestion[] {
  return [...places, ...addresses].slice(0, 10)
}

// Searching our own places — cities and neighbourhoods.
//
// Why this is not Mapbox: address lookup needs a token, and production has
// shipped without one. City and neighbourhood search runs on `places`, which
// is seeded, publicly readable, and ours. So someone with no working address
// search can still finish creating a Page, which makes this more than a
// convenience.
//
// A person typing "Oak Park" should not have to know whether that is a
// neighbourhood, a city, or a street address. One field searches all of it;
// each result says what it is.

export interface PlaceMatch {
  id: string
  name: string
  /** The row's own kind. Never rendered — placeKindLabel turns it into words. */
  kind: string
  /** "Sacramento" for a neighbourhood inside it. Disambiguates same-named places. */
  parentName: string | null
}

/** What a person is told a match is. Never the column value. */
export function placeKindLabel(kind: string): string {
  switch (kind) {
    case 'neighborhood':
      return 'Neighbourhood'
    case 'city':
      return 'City'
    case 'county':
      return 'County'
    case 'state':
      return 'State'
    case 'region':
      return 'Region'
    default:
      return 'Place'
  }
}

/** Smaller is more specific, so it wins a tie. */
const SPECIFICITY: Record<string, number> = {
  neighborhood: 0,
  city: 1,
  county: 2,
  state: 3,
  region: 4,
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Order matches the way a person expects: what they typed exactly, then what
 * starts with it, then what contains it. Ties go to the more specific place,
 * because "Sacramento" the neighbourhood-sized thing is likelier to be meant
 * than "Sacramento" the county.
 */
export function rankPlaces(query: string, places: PlaceMatch[]): PlaceMatch[] {
  const q = norm(query)
  if (!q) return []

  const scored = places
    .map((p) => {
      const n = norm(p.name)
      if (n === q) return { p, score: 0 }
      if (n.startsWith(q)) return { p, score: 1 }
      if (n.includes(q)) return { p, score: 2 }
      return null
    })
    .filter((x): x is { p: PlaceMatch; score: number } => x !== null)

  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        (SPECIFICITY[a.p.kind] ?? 9) - (SPECIFICITY[b.p.kind] ?? 9) ||
        a.p.name.localeCompare(b.p.name),
    )
    .map((x) => x.p)
}

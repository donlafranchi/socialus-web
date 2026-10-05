import { censusGeocodeAction } from '@/app/_actions/census-geocode-actions'

export interface GeocodingResult {
  name: string
  coordinates: [number, number]
}

/** Thrown when address search cannot run at all, as opposed to finding nothing.
 *  The two look identical to a caller that only sees an empty array, and the
 *  difference is the whole message: "we could not find that address" blames
 *  the person for a missing configuration. */
export class GeocodingUnavailableError extends Error {
  constructor() {
    super('Address search is unavailable right now.')
    this.name = 'GeocodingUnavailableError'
  }
}

export function geocodingConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN)
}

export async function geocode(query: string): Promise<GeocodingResult[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!query.trim()) return []
  // #348 — no Mapbox key (a preview) or a refused one: the free Census lookup
  // answers instead, for complete addresses. The provider is Don's call (A/B/C
  // on #348); this function is the one place that changes.
  if (!token) return censusGeocodeAction(query)

  const encoded = encodeURIComponent(query.trim())
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&limit=5&types=place,locality,neighborhood,address`
  )

  // A 401/403 is the same class of problem as no token at all: the search
  // cannot run. Anything else is a genuine miss.
  if (res.status === 401 || res.status === 403) return censusGeocodeAction(query)
  if (!res.ok) return []

  const data = await res.json()
  return (data.features || []).map((f: { place_name: string; center: [number, number] }) => ({
    name: f.place_name,
    coordinates: f.center,
  }))
}

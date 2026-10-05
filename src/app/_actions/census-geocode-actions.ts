'use server'

// #348 — the free fallback address lookup (US Census Geocoder, public domain)
// for when Mapbox can't run, e.g. a preview without a key. It matches complete
// addresses only, no partial typing, so it's a fallback, not autocomplete.

export async function censusGeocodeAction(query: string): Promise<{ name: string; coordinates: [number, number] }[]> {
  const q = query.trim()
  if (q.length < 6 || !/\d/.test(q)) return []
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress')
  url.search = new URLSearchParams({ address: q, benchmark: 'Public_AR_Current', format: 'json' }).toString()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) })
    if (!res.ok) return []
    const data = (await res.json()) as {
      result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number } }[] }
    }
    return (data.result?.addressMatches ?? []).slice(0, 5).map((m) => ({
      name: m.matchedAddress,
      coordinates: [m.coordinates.x, m.coordinates.y],
    }))
  } catch {
    return []
  }
}

// #348 — the free US Census Geocoder (public domain, no key, no spend): complete
// street addresses only. #936 — shared by the in-app fallback and the scripts
// that pin unclaimed Pages at their addresses.

export async function censusGeocode(query: string, fetchImpl: typeof fetch = fetch): Promise<{ name: string; coordinates: [number, number] }[]> {
  const q = query.trim()
  if (q.length < 6 || !/\d/.test(q)) return []
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress')
  url.search = new URLSearchParams({ address: q, benchmark: 'Public_AR_Current', format: 'json' }).toString()
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return []
    const data = (await res.json()) as { result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number } }[] } }
    return (data.result?.addressMatches ?? []).slice(0, 5).map((m) => ({ name: m.matchedAddress, coordinates: [m.coordinates.x, m.coordinates.y] }))
  } catch {
    return []
  }
}

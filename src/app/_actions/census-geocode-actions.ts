'use server'

// #348 — the free fallback address lookup (US Census Geocoder, public domain)
// for when Mapbox can't run, e.g. a preview without a key. It matches complete
// addresses only, no partial typing, so it's a fallback, not autocomplete.

import { censusGeocode } from '@/lib/geocoding/census'

export async function censusGeocodeAction(query: string): Promise<{ name: string; coordinates: [number, number] }[]> {
  return censusGeocode(query)
}

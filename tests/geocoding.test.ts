import { describe, it, expect, vi, beforeEach } from 'vitest'
import { geocode, geocodingConfigured, GeocodingUnavailableError } from '@/lib/geocoding'

describe('geocode', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'test-token')
  })

  it('returns empty array for empty query', async () => {
    const result = await geocode('')
    expect(result).toEqual([])
  })

  it('returns empty array for whitespace query', async () => {
    const result = await geocode('   ')
    expect(result).toEqual([])
  })

  // Amended (#107). This asserted that a missing token returns [] — the same
  // answer as "no address matched". Production shipped without a token, every
  // search came back empty, and the UI told people their address did not
  // exist. An empty array is now reserved for a real miss.
  it('refuses rather than returning empty when there is no token', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', '')
    await expect(geocode('Austin TX')).rejects.toBeInstanceOf(GeocodingUnavailableError)
  })

  it('refuses when Mapbox rejects the token', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.bad')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })))
    await expect(geocode('Austin TX')).rejects.toBeInstanceOf(GeocodingUnavailableError)
  })

  it('still returns empty for a genuine miss', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.good')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ features: [] }) })))
    await expect(geocode('nowhere at all')).resolves.toEqual([])
  })

  it('reports whether it is configured at all, without a network call', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', '')
    expect(geocodingConfigured()).toBe(false)
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.good')
    expect(geocodingConfigured()).toBe(true)
  })

  it('parses Mapbox response into GeocodingResult array', async () => {
    const mockResponse = {
      features: [
        { place_name: 'Austin, TX', center: [-97.7431, 30.2672] },
        { place_name: 'Austin, MN', center: [-92.9747, 43.6666] },
      ],
    }

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const results = await geocode('Austin')
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      name: 'Austin, TX',
      coordinates: [-97.7431, 30.2672],
    })
  })

  it('returns empty array on fetch error', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false })
    const results = await geocode('Austin')
    expect(results).toEqual([])
  })
})

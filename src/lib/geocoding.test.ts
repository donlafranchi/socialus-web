// #348 — address lookup goes through one function, whichever provider runs.

import { describe, it, expect, vi, afterEach } from 'vitest'

const census = vi.hoisted(() => vi.fn())
vi.mock('@/app/_actions/census-geocode-actions', () => ({ censusGeocodeAction: census }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  census.mockReset()
})

describe('#348 — geocode', () => {
  it('without a Mapbox key, falls back to the Census lookup', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', '')
    census.mockResolvedValue([{ name: '915 I ST, SACRAMENTO, CA, 95814', coordinates: [-121.494, 38.5817] }])
    const { geocode } = await import('./geocoding')
    expect(await geocode('915 I St, Sacramento')).toEqual([{ name: '915 I ST, SACRAMENTO, CA, 95814', coordinates: [-121.494, 38.5817] }])
  })

  it('with a Mapbox key, uses Mapbox and not the fallback', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ features: [{ place_name: '915 I St', center: [-121.49, 38.58] }] })))
    vi.stubGlobal('fetch', fetchMock)
    const { geocode } = await import('./geocoding')
    expect(await geocode('915 I St')).toEqual([{ name: '915 I St', coordinates: [-121.49, 38.58] }])
    expect(census).not.toHaveBeenCalled()
  })

  it('when Mapbox refuses the key, falls back too', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.bad')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    census.mockResolvedValue([{ name: 'A', coordinates: [1, 2] }])
    const { geocode } = await import('./geocoding')
    expect(await geocode('915 I St')).toEqual([{ name: 'A', coordinates: [1, 2] }])
  })
})

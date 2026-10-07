// T187 — the map now mounts on every desktop load, so a missing token must
// not take the surface down with it.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const MapCtor = vi.fn(() => {
  throw new Error('An API access token is required to use Mapbox GL.')
})
vi.mock('mapbox-gl', () => ({ default: { Map: MapCtor, Marker: vi.fn(), LngLatBounds: vi.fn() } }))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))

afterEach(cleanup)

describe('T187 — BrowseMap without a Mapbox token', () => {
  it('renders a placeholder instead of throwing', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', '')
    const { BrowseMap } = await import('./BrowseMap')
    render(<BrowseMap results={[]} />)
    expect(screen.getByTestId('browse-map')).toHaveAttribute('data-unavailable')
    expect(MapCtor).not.toHaveBeenCalled()
  })
})

// #330 — the map opens on the chosen metro, never the middle of the US.
describe('#330 — BrowseMap opens on the metro', () => {
  const fake = () => ({ on: vi.fn(), off: vi.fn(), remove: vi.fn(), getZoom: () => 10, project: vi.fn(), fitBounds: vi.fn(), jumpTo: vi.fn() })

  async function mountWith(center: [number, number] | undefined) {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test')
    const map = fake()
    const Ctor = vi.fn(function () { return map })
    vi.doMock('mapbox-gl', () => ({
      default: { Map: Ctor, Marker: vi.fn(() => ({ setLngLat: () => ({ addTo: vi.fn() }) })), LngLatBounds: vi.fn(() => ({ extend: vi.fn(), getCenter: vi.fn() })) },
    }))
    const { BrowseMap } = await import('./BrowseMap')
    const { MAP_DEFAULTS } = await import('@/lib/map-config')
    const ui = (c: typeof center) => <BrowseMap results={[]} center={c} />
    const view = render(ui(center))
    return { map, Ctor, MAP_DEFAULTS, view, ui }
  }

  it('starts centred on the metro', async () => {
    const { Ctor } = await mountWith([-121.49, 38.58])
    expect(Ctor).toHaveBeenCalledWith(expect.objectContaining({ center: [-121.49, 38.58] }))
  })

  it('without a known centre it still never starts on the US middle', async () => {
    const { Ctor, MAP_DEFAULTS } = await mountWith(undefined)
    const arg = (Ctor.mock.calls[0] as unknown as [{ center: [number, number]; zoom: number }])[0]
    expect(arg.center).not.toEqual(MAP_DEFAULTS.center)
    expect(arg.zoom).toBeGreaterThan(MAP_DEFAULTS.zoom)
  })

  it('re-centres when the metro changes and nothing is pinned', async () => {
    const { map, view, ui } = await mountWith([-121.49, 38.58])
    view.rerender(ui([-122.68, 45.52]))
    expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ center: [-122.68, 45.52] }))
  })
})

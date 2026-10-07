// T187 — the map now mounts on every desktop load, so a missing token must
// not take the surface down with it.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, within } from '@testing-library/react'
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

// #475 — an exact address is a teardrop; a place known only as an area is a disc
// with a count; pins at one address are spread apart.
describe('#475 — BrowseMap draws pins and area discs', () => {
  const row = (over: Record<string, unknown>) =>
    ({
      resultKind: 'page', resultId: 'r', groupId: 'g', name: 'Name', href: '/g/x', locationId: 'l',
      locationLabel: 'Midtown', longitude: -121.5, latitude: 38.5, tags: [], body: null, description: null, ...over,
    }) as never

  async function draw(results: never[]) {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test')
    // Only what is still on the map: every redraw removes the last one's markers.
    const live = new Map<HTMLElement, { opts: unknown; at: unknown }>()
    const map = {
      on: vi.fn(), off: vi.fn(), remove: vi.fn(), jumpTo: vi.fn(), fitBounds: vi.fn(), getZoom: () => 15,
      project: ([x, y]: number[]) => ({ x: x * 1000, y: y * 1000 }),
      unproject: ([x, y]: number[]) => ({ lng: x! / 1000, lat: y! / 1000 }),
    }
    vi.doMock('mapbox-gl', () => ({
      default: {
        Map: vi.fn(function () { return map }),
        Marker: vi.fn(function (el: HTMLElement, opts: unknown) {
          live.set(el, { opts, at: null })
          const m = {
            setLngLat: (at: unknown) => ((live.get(el)!.at = at), m),
            addTo: () => m,
            remove: () => void live.delete(el),
          }
          return m
        }),
        LngLatBounds: vi.fn(function () { return { extend: vi.fn(), getCenter: () => ({ lng: 0, lat: 0 }) } }),
      },
    }))
    const { BrowseMap } = await import('./BrowseMap')
    render(<BrowseMap results={results} />)
    return { els: [...live.keys()], markers: [...live.values()] }
  }

  it('an exact address is a teardrop anchored at its tip; an area is a disc with a count', async () => {
    const { els, markers } = await draw([
      row({ locationKind: 'permanent', resultId: 'a', groupId: 'g1', locationId: 'l1' }),
      row({ locationKind: 'area', resultId: 'b', groupId: 'g2', locationId: 'l2', longitude: -121.9, latitude: 38.9 }),
      row({ locationKind: 'area', resultId: 'c', groupId: 'g3', locationId: 'l3', longitude: -121.9, latitude: 38.9 }),
    ])
    const shapes = els.map((e) => e.dataset.shape).sort()
    expect(shapes).toEqual(['area', 'teardrop'])
    expect(els.find((e) => e.dataset.shape === 'area')!.textContent).toBe('2')
    expect(markers.some((m) => (m.opts as { anchor?: string } | undefined)?.anchor === 'bottom')).toBe(true)
  })

  it('pins at one address sit apart from each other', async () => {
    const { markers } = await draw([
      row({ locationKind: 'permanent', resultId: 'a', groupId: 'g1', locationId: 'l1' }),
      row({ locationKind: 'permanent', resultId: 'b', groupId: 'g2', locationId: 'l1' }),
    ])
    const [p, q] = markers.map((m) => m.at as [number, number])
    expect(p).not.toEqual(q)
  })

  it('tapping an area disc opens a list of what is there, each linking to its Page', async () => {
    const { els } = await draw([
      row({ locationKind: 'area', resultId: 'b', groupId: 'g2', name: 'Run Club', href: '/g/run', longitude: -121.9, latitude: 38.9 }),
      row({ locationKind: 'area', resultId: 'c', groupId: 'g3', name: 'Chess Night', href: '/g/chess', longitude: -121.9, latitude: 38.9 }),
    ])
    act(() => els.find((e) => e.dataset.shape === 'area')!.click())
    const popup = screen.getByTestId('browse-map-popup')
    expect(popup).toHaveTextContent('Midtown')
    expect(popup).toHaveTextContent('2 here')
    expect(within(popup).getByRole('link', { name: 'Run Club' })).toHaveAttribute('href', '/g/run')
    expect(within(popup).getByRole('link', { name: 'Chess Night' })).toHaveAttribute('href', '/g/chess')
  })
})

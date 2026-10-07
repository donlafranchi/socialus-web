// #413 — the owner puts the pin on the front door: drag it, or tap the map
// where it goes (Google Business Profile, Airbnb). Replaces #348's fixed
// centre pin with a panned map.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

type Handler = (e?: { lngLat: { lng: number; lat: number } }) => void
const mapHandlers: Record<string, Handler> = {}
const markerHandlers: Record<string, Handler> = {}
const map = {
  on: vi.fn((ev: string, fn: Handler) => { mapHandlers[ev] = fn }),
  easeTo: vi.fn(),
  remove: vi.fn(),
  addControl: vi.fn(),
}
let markerAt = { lng: 0, lat: 0 }
const marker = {
  setLngLat: vi.fn((c: [number, number]) => { markerAt = { lng: c[0], lat: c[1] }; return marker }),
  getLngLat: vi.fn(() => markerAt),
  addTo: vi.fn(() => marker),
  on: vi.fn((ev: string, fn: Handler) => { markerHandlers[ev] = fn; return marker }),
  remove: vi.fn(),
}
const MapCtor = vi.fn(function () { return map })
const MarkerCtor = vi.fn(function () { return marker })
vi.mock('mapbox-gl', () => ({ default: { Map: MapCtor, Marker: MarkerCtor, NavigationControl: vi.fn() } }))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))

beforeEach(() => {
  MapCtor.mockClear()
  MarkerCtor.mockClear()
  map.remove.mockClear()
  map.easeTo.mockClear()
  marker.setLngLat.mockClear()
  vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test')
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('#413 — drag the pin to the front door', () => {
  it('opens on the place chosen, with a draggable pin on it and a plain instruction', async () => {
    const { PinAdjustMap } = await import('./PinAdjustMap')
    render(<PinAdjustMap center={[-121.48, 38.56]} onChange={vi.fn()} />)
    expect(MapCtor).toHaveBeenCalledWith(expect.objectContaining({ center: [-121.48, 38.56] }))
    expect(MarkerCtor).toHaveBeenCalledWith(expect.objectContaining({ draggable: true }))
    expect(marker.setLngLat).toHaveBeenCalledWith([-121.48, 38.56])
    expect(screen.getByText(/drag the pin to your front door/i)).toBeInTheDocument()
  })

  it('reports where the pin lands after the owner drags it', async () => {
    const onChange = vi.fn()
    const { PinAdjustMap } = await import('./PinAdjustMap')
    render(<PinAdjustMap center={[-121.48, 38.56]} onChange={onChange} />)
    markerAt = { lng: -121.4801234, lat: 38.5602346 }
    markerHandlers.dragend!()
    expect(onChange).toHaveBeenCalledWith([-121.480123, 38.560235])
  })

  it('a tap on the map moves the pin there', async () => {
    const onChange = vi.fn()
    const { PinAdjustMap } = await import('./PinAdjustMap')
    render(<PinAdjustMap center={[-121.48, 38.56]} onChange={onChange} />)
    mapHandlers.click!({ lngLat: { lng: -121.47, lat: 38.57 } })
    expect(marker.setLngLat).toHaveBeenLastCalledWith([-121.47, 38.57])
    expect(onChange).toHaveBeenCalledWith([-121.47, 38.57])
  })

  it('keeps the same map while the owner drags: the reported spot coming back is not a new place', async () => {
    const { PinAdjustMap } = await import('./PinAdjustMap')
    const { rerender } = render(<PinAdjustMap center={[-121.48, 38.56]} onChange={vi.fn()} />)
    markerAt = { lng: -121.4801, lat: 38.5602 }
    markerHandlers.dragend!()
    marker.setLngLat.mockClear()
    rerender(<PinAdjustMap center={[-121.4801, 38.5602]} onChange={vi.fn()} />)
    expect(MapCtor).toHaveBeenCalledTimes(1)
    expect(map.remove).not.toHaveBeenCalled()
    expect(marker.setLngLat).not.toHaveBeenCalled()
    expect(map.easeTo).not.toHaveBeenCalled()
  })

  it('a newly chosen address or neighbourhood moves the pin and the map to it, on the same map', async () => {
    const { PinAdjustMap } = await import('./PinAdjustMap')
    const { rerender } = render(<PinAdjustMap center={[-121.48, 38.56]} onChange={vi.fn()} />)
    rerender(<PinAdjustMap center={[-121.45, 38.55]} onChange={vi.fn()} />)
    expect(MapCtor).toHaveBeenCalledTimes(1)
    expect(marker.setLngLat).toHaveBeenLastCalledWith([-121.45, 38.55])
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [-121.45, 38.55] }))
  })

  it('without a map key, says the address is used as found, and draws no map', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', '')
    const { PinAdjustMap } = await import('./PinAdjustMap')
    render(<PinAdjustMap center={[-121.48, 38.56]} onChange={vi.fn()} />)
    expect(MapCtor).not.toHaveBeenCalled()
    expect(screen.getByTestId('pin-adjust')).toHaveTextContent(/as found/i)
  })
})

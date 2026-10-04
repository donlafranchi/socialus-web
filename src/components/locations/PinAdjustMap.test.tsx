// #348 — after an address is found, the owner confirms it on a map with a
// fixed centre pin and pans the map to put the pin on the right spot (Airbnb).

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const handlers: Record<string, () => void> = {}
const map = {
  on: vi.fn((ev: string, fn: () => void) => { handlers[ev] = fn }),
  getCenter: vi.fn(() => ({ lng: -121.4801, lat: 38.5602 })),
  setCenter: vi.fn(),
  remove: vi.fn(),
  addControl: vi.fn(),
}
const MapCtor = vi.fn(function () { return map })
vi.mock('mapbox-gl', () => ({ default: { Map: MapCtor, NavigationControl: vi.fn() } }))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))

beforeEach(() => {
  MapCtor.mockClear()
  vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test')
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('#348 — confirm the pin', () => {
  it('opens on the address, with the pin fixed at the centre', async () => {
    const { PinAdjustMap } = await import('./PinAdjustMap')
    render(<PinAdjustMap center={[-121.48, 38.56]} onChange={vi.fn()} />)
    expect(MapCtor).toHaveBeenCalledWith(expect.objectContaining({ center: [-121.48, 38.56] }))
    expect(screen.getByTestId('pin-adjust-pin')).toBeInTheDocument()
    expect(screen.getByText(/move the map/i)).toBeInTheDocument()
  })

  it('reports where the pin sits after the owner moves the map', async () => {
    const onChange = vi.fn()
    const { PinAdjustMap } = await import('./PinAdjustMap')
    render(<PinAdjustMap center={[-121.48, 38.56]} onChange={onChange} />)
    handlers.moveend!()
    expect(onChange).toHaveBeenCalledWith([-121.4801, 38.5602])
  })

  it('without a map key, says the address is used as found, and draws no map', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', '')
    const { PinAdjustMap } = await import('./PinAdjustMap')
    render(<PinAdjustMap center={[-121.48, 38.56]} onChange={vi.fn()} />)
    expect(MapCtor).not.toHaveBeenCalled()
    expect(screen.getByTestId('pin-adjust')).toHaveTextContent(/as found/i)
  })
})

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

// #896 — the Page's map opens our own map; only Directions leaves the app.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PageMap } from './PageMap'
import { pageMapView } from '@/lib/groups/page-map'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const view = pageMapView({ source: 'anchor', kind: 'point', label: '2700 K St, Sacramento, CA 95816', lng: -121.47103, lat: 38.57271 }, 'visit')!
const show = () => render(<PageMap view={view} caption={view.text} publicId="k7x2m9" />)

describe('PageMap', () => {
  it('tapping the map opens our own map on this Page, in the app', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'tok')
    show()
    const map = screen.getByRole('link', { name: `Show ${view.text} on the map` })
    expect(map).toHaveAttribute('href', '/explore?view=map&focus=k7x2m9&at=-121.47103%2C38.57271')
    expect(map).not.toHaveAttribute('target')
  })

  it('no "Open in Maps": nothing but Directions leaves the app', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'tok')
    show()
    expect(screen.queryByText(/open in maps/i)).toBeNull()
    expect(screen.getAllByRole('link').filter((a) => a.getAttribute('target') === '_blank').map((a) => a.textContent)).toEqual(['Directions'])
  })

  it('on an iPhone, Directions open Apple Maps', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')
    show()
    expect(screen.getByRole('link', { name: 'Directions' }).getAttribute('href')).toMatch(/^https:\/\/maps\.apple\.com\/\?daddr=/)
  })

  it('elsewhere, Google Maps', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 15; Pixel 9)')
    show()
    expect(screen.getByRole('link', { name: 'Directions' }).getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//)
  })

  it('Directions is a quiet text link, 44px tall, opening outside the app', () => {
    show()
    const a = screen.getByRole('link', { name: 'Directions' })
    expect(a.className).toMatch(/min-h-tap/)
    expect(a.className).not.toMatch(/rounded|btn-/)
    expect(a).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

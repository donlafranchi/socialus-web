// #896 — Open in Maps opens the phone's own maps app.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PageMap } from './PageMap'
import { pageMapView } from '@/lib/groups/page-map'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const view = pageMapView({ source: 'anchor', kind: 'point', label: '2700 K St, Sacramento, CA 95816', lng: -121.47103, lat: 38.57271 }, 'visit')!

describe('PageMap', () => {
  it('on an iPhone, Apple Maps', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')
    render(<PageMap view={view} caption={view.text} />)
    expect(screen.getByRole('link', { name: 'Open in Maps' }).getAttribute('href')).toMatch(/^https:\/\/maps\.apple\.com\/\?q=/)
    expect(screen.getByRole('link', { name: 'Directions' }).getAttribute('href')).toMatch(/^https:\/\/maps\.apple\.com\/\?daddr=/)
  })

  it('elsewhere, Google Maps', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 15; Pixel 9)')
    render(<PageMap view={view} caption={view.text} />)
    expect(screen.getByRole('link', { name: 'Open in Maps' }).getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/search\//)
  })

  it('quiet text links, 44px tall, that open outside the app', () => {
    render(<PageMap view={view} caption={view.text} />)
    for (const name of ['Open in Maps', 'Directions']) {
      const a = screen.getByRole('link', { name })
      expect(a.className).toMatch(/min-h-tap/)
      expect(a.className).not.toMatch(/rounded|btn-/)
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })
})

// #896 — what the Page's map shows, and where Open in Maps / Directions go.
import { describe, it, expect } from 'vitest'
import { pageMapView, staticMapUrl, mapsLinks } from './page-map'
import type { Placement } from './resolve-page-placement'

const point: Placement = { source: 'anchor', kind: 'point', label: '2700 K St, Sacramento, CA 95816', lng: -121.47103, lat: 38.57271 }
const area: Placement = { source: 'anchor', kind: 'area', label: 'Midtown', lng: -121.48456, lat: 38.57123 }

describe('pageMapView', () => {
  it('a fixed address: street zoom, a pin, the address, Directions', () => {
    expect(pageMapView(point, 'visit')).toEqual({
      kind: 'point', centre: [-121.47103, 38.57271], zoom: 16, text: point.label, directions: true,
    })
  })

  it('an area: area zoom, no pin, the area name, a rounded centre, no Directions', () => {
    expect(pageMapView(area, 'visit')).toEqual({
      kind: 'area', centre: [-121.48, 38.57], zoom: 13, text: 'Midtown', directions: false,
    })
  })

  it('a Page that moves has no fixed place to map (#894), even if its anchor is one', () => {
    for (const mode of ['roaming', 'travel'] as const) expect(pageMapView(point, mode)).toBeNull()
  })

  it('nothing to show without a placement or a label', () => {
    expect(pageMapView(undefined, 'visit')).toBeNull()
    expect(pageMapView({ ...point, label: '  ' }, 'visit')).toBeNull()
  })
})

describe('staticMapUrl', () => {
  it('a point gets a pin at street zoom, sized for a phone column', () => {
    const url = staticMapUrl(pageMapView(point, 'visit')!, 'tok')
    expect(url).toContain('pin-l+24405a(-121.47103,38.57271)')
    expect(url).toContain('/-121.47103,38.57271,16,0/400x200@2x')
    expect(url).toContain('access_token=tok')
  })

  it('an area gets a circle, no pin', () => {
    const url = staticMapUrl(pageMapView(area, 'visit')!, 'tok')
    expect(url).not.toContain('pin-')
    expect(url).toContain('geojson(')
    expect(url).toContain('/-121.48,38.57,13,0/')
  })
})

describe('mapsLinks', () => {
  it('Google Maps by default, with directions to the address', () => {
    const l = mapsLinks(pageMapView(point, 'visit')!, false)
    expect(l.open).toBe('https://www.google.com/maps/search/?api=1&query=2700%20K%20St%2C%20Sacramento%2C%20CA%2095816')
    expect(l.directions).toBe('https://www.google.com/maps/dir/?api=1&destination=2700%20K%20St%2C%20Sacramento%2C%20CA%2095816')
  })

  it('Apple Maps on an iPhone', () => {
    const l = mapsLinks(pageMapView(point, 'visit')!, true)
    expect(l.open).toBe('https://maps.apple.com/?q=2700%20K%20St%2C%20Sacramento%2C%20CA%2095816&ll=38.57271,-121.47103')
    expect(l.directions).toBe('https://maps.apple.com/?daddr=2700%20K%20St%2C%20Sacramento%2C%20CA%2095816')
  })

  it('an area opens on its rounded centre and offers no directions', () => {
    const v = pageMapView(area, 'visit')!
    expect(mapsLinks(v, false)).toEqual({ open: 'https://www.google.com/maps/search/?api=1&query=38.57,-121.48', directions: null })
    expect(mapsLinks(v, true)).toEqual({ open: 'https://maps.apple.com/?q=Midtown&ll=38.57,-121.48&z=13', directions: null })
  })
})

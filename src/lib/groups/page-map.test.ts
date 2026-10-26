// #896 — what the Page's map shows, and where Open in Maps / Directions go.
import { describe, it, expect } from 'vitest'
import { pageMapView, staticMapUrl, mapsTargetOf } from './page-map'
import { mapsLinks } from '@/lib/maps/links'
import type { Placement } from './resolve-page-placement'

const point: Placement = { source: 'anchor', kind: 'point', label: '2700 K St, Sacramento, CA 95816', lng: -121.47103, lat: 38.57271 }
const area: Placement = { source: 'anchor', kind: 'area', label: 'Midtown', lng: -121.48456, lat: 38.57123 }

describe('pageMapView', () => {
  it('a fixed address: street zoom, a pin, the address, Directions', () => {
    expect(pageMapView(point, 'visit')).toEqual({
      kind: 'point', centre: [-121.47103, 38.57271], zoom: 16, text: point.label, directions: true,
    })
  })

  // Don, 2026-10-18: an area-only Page has no map at all.
  it('an area: no map, so no point', () => {
    expect(pageMapView(area, 'visit')).toBeNull()
  })

  it('a Page that moves has no fixed place to map (#894), even if its anchor is one', () => {
    expect(pageMapView(point, 'roaming')).toBeNull()
    expect(pageMapView(point, 'travel')).toBeNull()
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

})

describe('mapsLinks', () => {
  it('Google Maps by default, with directions to the address', () => {
    const l = mapsLinks(mapsTargetOf(pageMapView(point, 'visit')!), false)
    expect(l.open).toBe('https://www.google.com/maps/search/?api=1&query=2700%20K%20St%2C%20Sacramento%2C%20CA%2095816')
    expect(l.directions).toBe('https://www.google.com/maps/dir/?api=1&destination=2700%20K%20St%2C%20Sacramento%2C%20CA%2095816')
  })

  it('Apple Maps on an iPhone', () => {
    const l = mapsLinks(mapsTargetOf(pageMapView(point, 'visit')!), true)
    expect(l.open).toBe('https://maps.apple.com/?q=2700%20K%20St%2C%20Sacramento%2C%20CA%2095816&ll=38.57271,-121.47103')
    expect(l.directions).toBe('https://maps.apple.com/?daddr=2700%20K%20St%2C%20Sacramento%2C%20CA%2095816')
  })

})

// #896 — the map for each answer.
describe('pageMapView — every answer', () => {
  const metroAnchor: Placement = { source: 'anchor', kind: 'area', label: 'East Sacramento', lng: -121.46123, lat: 38.56456 }
  it('cross streets or a landmark: a pin at street zoom, its own words, Maps by the pin', () => {
    const landmark: Placement = { ...point, label: 'J St & 20th St, by the fountain' }
    expect(pageMapView(landmark, 'landmark')).toEqual({
      kind: 'point', centre: [point.lng, point.lat], zoom: 16, text: 'J St & 20th St, by the fountain', directions: true, byCoords: true,
    })
  })
  it('I go to them, more than one location, it moves, or online: no map', () => {
    for (const mode of ['travel', 'multi', 'roaming', 'online'] as const) expect(pageMapView(metroAnchor, mode)).toBeNull()
  })
  it('Maps by the pin for a landmark: its words would not find it', () => {
    const v = pageMapView({ ...point, label: 'by the fountain' }, 'landmark')!
    expect(mapsLinks(mapsTargetOf(v), false)).toEqual({
      open: 'https://www.google.com/maps/search/?api=1&query=38.57271,-121.47103',
      directions: 'https://www.google.com/maps/dir/?api=1&destination=38.57271,-121.47103',
    })
    expect(mapsLinks(mapsTargetOf(v), true)).toEqual({
      open: 'https://maps.apple.com/?q=by%20the%20fountain&ll=38.57271,-121.47103',
      directions: 'https://maps.apple.com/?daddr=38.57271,-121.47103',
    })
  })
})

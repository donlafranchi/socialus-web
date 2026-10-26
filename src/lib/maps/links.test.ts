import { describe, it, expect } from 'vitest'
import { isAppleMobile, mapsLinks } from './links'

const exact = { label: '2700 K St, Sacramento, CA', lng: -121.471, lat: 38.5727, exact: true }

describe('mapsLinks', () => {
  it('Google by default; Apple on iOS; both with directions for an exact place', () => {
    expect(mapsLinks(exact, false).directions).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=2700%20K%20St/)
    expect(mapsLinks(exact, true).open).toBe('https://maps.apple.com/?q=2700%20K%20St%2C%20Sacramento%2C%20CA&ll=38.5727,-121.471')
  })
  it('an area: centre only, no directions', () => {
    expect(mapsLinks({ ...exact, exact: false, zoom: 13 }, true)).toEqual({ open: 'https://maps.apple.com/?q=2700%20K%20St%2C%20Sacramento%2C%20CA&ll=38.5727,-121.471&z=13', directions: null })
  })
})

describe('isAppleMobile', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5, true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 5, true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 0, false],
    ['Mozilla/5.0 (Linux; Android 15)', 'Linux armv8l', 5, false],
  ])('%s on %s with %d touch points → %s', (userAgent, platform, maxTouchPoints, want) => {
    expect(isAppleMobile({ userAgent, platform, maxTouchPoints })).toBe(want)
  })
})

describe('mapsLinks — a place found by words only', () => {
  it('a stop with no pin opens a search for its words, with directions to them', () => {
    expect(mapsLinks({ label: 'Midtown Farmers Market' }, false)).toEqual({
      open: 'https://www.google.com/maps/search/?api=1&query=Midtown%20Farmers%20Market',
      directions: 'https://www.google.com/maps/dir/?api=1&destination=Midtown%20Farmers%20Market',
    })
    expect(mapsLinks({ label: 'Midtown Farmers Market' }, true).open).toBe('https://maps.apple.com/?q=Midtown%20Farmers%20Market')
  })
})

// #936 — Don, 2026-10-18: Open in Maps went to the town, not the business. Name plus full street address.
describe('mapsLinks — a business by name and street address', () => {
  const vino = { name: 'Vino Tahoe', label: '15010 Ridge Road, Sutter Creek, CA', lng: -120.8401, lat: 38.3655, exact: true }
  it('Apple Maps: the name, at its address; directions to the address', () => {
    expect(mapsLinks(vino, true)).toEqual({
      open: 'https://maps.apple.com/?q=Vino%20Tahoe&address=15010%20Ridge%20Road%2C%20Sutter%20Creek%2C%20CA',
      directions: 'https://maps.apple.com/?daddr=15010%20Ridge%20Road%2C%20Sutter%20Creek%2C%20CA',
    })
  })
  it('Google Maps: the name and address together, both ways', () => {
    expect(mapsLinks(vino, false)).toEqual({
      open: 'https://www.google.com/maps/search/?api=1&query=Vino%20Tahoe%2C%2015010%20Ridge%20Road%2C%20Sutter%20Creek%2C%20CA',
      directions: 'https://www.google.com/maps/dir/?api=1&destination=Vino%20Tahoe%2C%2015010%20Ridge%20Road%2C%20Sutter%20Creek%2C%20CA',
    })
  })
  it('an area never gets the name-and-address treatment or directions', () => {
    expect(mapsLinks({ ...vino, exact: false, zoom: 13 }, false).directions).toBeNull()
  })
})

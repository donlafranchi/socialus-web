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

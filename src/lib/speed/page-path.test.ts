import { describe, it, expect } from 'vitest'
import { pagePathOf } from './page-path'

// #978 — Explore lists posts at /<town>/<page>/<post> now, not /g/ links, so the tap-speed run finds a Page from them.
describe('pagePathOf', () => {
  it('a post link gives its Page', () => {
    expect(pagePathOf('/sacramento-ca/old-city-kites/limited-nov-4')).toBe('/sacramento-ca/old-city-kites')
  })
  it('a Page link is itself; a /g/ link still counts', () => {
    expect(pagePathOf('/sacramento-ca/old-city-kites')).toBe('/sacramento-ca/old-city-kites')
    expect(pagePathOf('/g/85zc0x')).toBe('/g/85zc0x')
  })
  it('anything else is not a Page', () => {
    for (const h of ['/report', '/terms', '/explore?q=x', 'https://example.com/a/b', '/a/b#x', null]) expect(pagePathOf(h)).toBeNull()
  })
})

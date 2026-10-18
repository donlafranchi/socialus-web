// #896 — a Page's map opens Explore's map on that Page.
import { describe, it, expect } from 'vitest'
import { mapFocusFrom, mapFocusHref } from './map-focus'

describe('mapFocusHref', () => {
  it("carries the Page's id and where it is", () => {
    expect(mapFocusHref('vino12', [-120.752837, 38.400548])).toBe('/explore?view=map&focus=vino12&at=-120.75284%2C38.40055')
  })
})

describe('mapFocusFrom', () => {
  it('reads the Page and where it is back', () => {
    expect(mapFocusFrom(new URLSearchParams('view=map&focus=vino12&at=-120.75284,38.40055'))).toEqual({ href: '/g/vino12', at: [-120.75284, 38.40055] })
  })
  it('nothing usable, no focus: a bad id, a bad point, or only one of them', () => {
    for (const q of ['focus=vino12', 'at=-120.7,38.4', 'focus=../x&at=-120.7,38.4', 'focus=vino12&at=abc,38', 'focus=vino12&at=-500,38']) {
      expect(mapFocusFrom(new URLSearchParams(q))).toBeNull()
    }
  })
})

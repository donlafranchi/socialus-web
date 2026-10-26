import { describe, it, expect } from 'vitest'
import { closeness, stillToGo, sortBoard, placesLeft, makerLink, matchTown, KIND_LABELS, type TownRow } from './towns'

const town = (o: Partial<TownRow>): TownRow => ({
  slug: 'solano', name: 'Solano County', place_names: ['Vacaville', 'Dixon'], maker_goal: 100, supporter_goal: 1000,
  makers: 0, supporters: 0, kinds: {}, ready_at: null, ready_rank: null, ...o,
})

describe('F118 — the town board', () => {
  it('still to go never goes below zero', () => {
    expect(stillToGo(4, 100)).toBe(96)
    expect(stillToGo(140, 100)).toBe(0)
  })

  it('closeness weighs both goals and caps each at full', () => {
    expect(closeness(town({ makers: 50, supporters: 500 }))).toBeCloseTo(0.5)
    expect(closeness(town({ makers: 300, supporters: 0 }))).toBeCloseTo(0.5)
  })

  it('sorts ready towns first by rank, then the closest', () => {
    const rows = [
      town({ slug: 'a', makers: 10 }),
      town({ slug: 'b', makers: 90, supporters: 900 }),
      town({ slug: 'c', ready_rank: 1, ready_at: '2026-11-01', makers: 100, supporters: 1000 }),
    ]
    expect(sortBoard(rows).map((r) => r.slug)).toEqual(['c', 'b', 'a'])
  })

  it('this round has 3 places, and a ready town takes one', () => {
    expect(placesLeft([town({}), town({ ready_rank: 1 })])).toBe(2)
    expect(placesLeft([town({ ready_rank: 1 }), town({ ready_rank: 2 }), town({ ready_rank: 3 })])).toBe(0)
  })

  it('finds a town by its name, a town inside it, or a prefix', () => {
    const rows = [town({}), town({ slug: 'tahoe', name: 'Lake Tahoe', place_names: ['Kings Beach'] })]
    expect(matchTown(rows, 'vacaville')?.slug).toBe('solano')
    expect(matchTown(rows, 'Kings')?.slug).toBe('tahoe')
    expect(matchTown(rows, 'solano')?.slug).toBe('solano')
    expect(matchTown(rows, 'Boise')).toBeNull()
    expect(matchTown(rows, ' ')).toBeNull()
  })

  it('has a label for every maker kind', () => {
    expect(Object.keys(KIND_LABELS)).toEqual(['food', 'shops', 'makers', 'services', 'groups'])
  })
})

describe('F118 — a maker link is its own site or a social profile', () => {
  it('accepts its own site and normalises it to https without a trailing slash', () => {
    expect(makerLink('bluebirdbakery.com/')).toEqual({ ok: true, url: 'https://bluebirdbakery.com' })
    expect(makerLink('http://www.bluebird.co/shop')).toEqual({ ok: true, url: 'https://www.bluebird.co/shop' })
  })

  it('accepts a social profile', () => {
    expect(makerLink('https://instagram.com/bluebird').ok).toBe(true)
    expect(makerLink('https://www.tiktok.com/@bluebird').ok).toBe(true)
  })

  it('refuses a review site, a map or a ticket seller, which is not the maker', () => {
    for (const u of ['https://www.yelp.com/biz/x', 'https://maps.google.com/?q=x', 'https://goo.gl/maps/x', 'https://www.eventbrite.com/e/1', 'https://www.tripadvisor.com/x']) {
      expect(makerLink(u).ok).toBe(false)
    }
  })

  it('refuses a bare social site and junk', () => {
    expect(makerLink('https://instagram.com/').ok).toBe(false)
    expect(makerLink('not a link').ok).toBe(false)
    expect(makerLink('javascript:alert(1)').ok).toBe(false)
    expect(makerLink('').ok).toBe(false)
  })
})

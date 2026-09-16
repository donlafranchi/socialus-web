// Searching our own places — cities and neighbourhoods, no Mapbox.
//
// The point of this being our data: someone with no working address search can
// still finish creating a Page. Address lookup goes to Mapbox and needs a
// token; this does not.

import { describe, it, expect } from 'vitest'
import { placeKindLabel, rankPlaces, type PlaceMatch } from './search'

const p = (name: string, kind: string, parent?: string): PlaceMatch => ({
  id: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  kind,
  parentName: parent ?? null,
})

describe('what a match is called', () => {
  it('says neighbourhood and city in words a person uses', () => {
    expect(placeKindLabel('neighborhood')).toBe('Neighbourhood')
    expect(placeKindLabel('city')).toBe('City')
  })

  it('never leaks the internal kind string', () => {
    for (const k of ['neighborhood', 'city', 'county', 'state', 'region']) {
      expect(placeKindLabel(k)).not.toBe(k)
      expect(placeKindLabel(k)).not.toMatch(/_/)
    }
  })

  it('has a plain fallback rather than an empty label', () => {
    expect(placeKindLabel('something-new')).toBe('Place')
  })
})

describe('ranking', () => {
  it('puts an exact name first', () => {
    const out = rankPlaces('oak park', [p('Oak Park Heights', 'neighborhood'), p('Oak Park', 'neighborhood')])
    expect(out[0].name).toBe('Oak Park')
  })

  it('puts a prefix match above a mid-string match', () => {
    const out = rankPlaces('sac', [p('West Sacramento', 'city'), p('Sacramento', 'city')])
    expect(out[0].name).toBe('Sacramento')
  })

  it('prefers the smaller place when names tie, because it is more specific', () => {
    const out = rankPlaces('sacramento', [p('Sacramento', 'county'), p('Sacramento', 'city')])
    expect(out[0].kind).toBe('city')
  })

  it('is case and space insensitive', () => {
    expect(rankPlaces('  OAK PARK ', [p('Oak Park', 'neighborhood')])).toHaveLength(1)
  })

  it('drops anything that does not match at all', () => {
    expect(rankPlaces('zzz', [p('Oak Park', 'neighborhood')])).toEqual([])
  })

  it('returns nothing for an empty query rather than everything', () => {
    expect(rankPlaces('', [p('Oak Park', 'neighborhood')])).toEqual([])
  })
})

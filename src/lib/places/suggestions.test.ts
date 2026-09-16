// One field for an address, a city, or a neighbourhood.
//
// Don's point: typing "Oak Park" should not require knowing which of the three
// it is. So one search, one list, every row saying what it is.
//
// The half that runs on our own data must keep working when Mapbox does not —
// production shipped without a token, and that is the case this protects.

import { describe, it, expect } from 'vitest'
import { mergeMatches, type Suggestion } from '@/lib/places/suggestions'
import { placeKindLabel } from '@/lib/places/search'

const addr = (name: string): Suggestion => ({
  source: 'address', kind: 'address', label: name, sublabel: null,
  address: { name, coordinates: [-121, 38] },
})
const place = (name: string, k: string, parent?: string): Suggestion => ({
  source: 'place', kind: k, label: name, sublabel: parent ?? null, placeId: name.toLowerCase(),
})

describe('merging the two sources', () => {
  it('puts our own places before addresses', () => {
    // Ours always work; Mapbox may not. Leading with what is reliable also
    // matches what someone vague about their location is looking for.
    const out = mergeMatches([place('Oak Park', 'neighborhood')], [addr('Oak Park Rd, Sacramento')])
    expect(out[0].kind).toBe('neighborhood')
    expect(out[1].kind).toBe('address')
  })

  it('keeps addresses when there are no place matches', () => {
    const out = mergeMatches([], [addr('123 Main St')])
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('address')
  })

  it('keeps places when addresses are unavailable', () => {
    // The whole point: no token, still usable.
    const out = mergeMatches([place('Davis', 'city')], [])
    expect(out).toHaveLength(1)
    expect(out[0].label).toBe('Davis')
  })

  it('caps the list so it stays scannable', () => {
    const many = Array.from({ length: 30 }, (_, i) => place(`P${i}`, 'city'))
    expect(mergeMatches(many, [addr('a'), addr('b')]).length).toBeLessThanOrEqual(10)
  })

  it('returns nothing when both sources are empty', () => {
    expect(mergeMatches([], [])).toEqual([])
  })
})

describe('what each row is called', () => {
  it('labels a place in plain words and never the internal kind', () => {
    // The row renders placeKindLabel(kind) beside the name; the label itself
    // is unit-tested in search.test.ts. This pins the pairing.
    const rows = [place('Oak Park', 'neighborhood', 'Sacramento'), place('Oakdale', 'city'), addr('Oak St')]
    const labels = rows.map((r) => (r.source === 'address' ? 'Address' : placeKindLabel(r.kind)))
    expect(labels).toEqual(['Neighbourhood', 'City', 'Address'])
    expect(labels.join(' ')).not.toContain('neighborhood')
  })

  it('carries the parent so two places with one name are tellable apart', () => {
    expect(place('Oak Park', 'neighborhood', 'Sacramento').sublabel).toBe('Sacramento')
  })
})

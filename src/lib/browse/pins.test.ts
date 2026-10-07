import { describe, it, expect } from 'vitest'
import { groupPins } from './pins'
import type { BrowseResult } from '@/lib/feed/browse-feed'

function row(over: Partial<BrowseResult> = {}): BrowseResult {
  return {
    resultKind: 'page',
    resultId: 'r1',
    groupId: 'g1',
    groupKind: 'business',
    slug: 'sourdough-co',
    name: 'Sourdough Co',
    href: '/p/ca/sac/g/sourdough-co',
    photoUrl: null,
    description: null,
    body: null,
    tags: [],
    startsAt: null,
    locationId: 'loc-shop',
    locationLabel: 'Midtown',
    longitude: -121.4,
    latitude: 38.5,
    pageCreatedAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-02T00:00:00Z',
    postedAt: null,
    sortAt: '2026-09-02T00:00:00Z',
    withheld: false,
    announcementCount: null,
    announcementIds: null,
    ...over,
  }
}

describe('T156 — groupPins', () => {
  it('one Page at one place is one pin', () => {
    expect(groupPins([row()])).toHaveLength(1)
  })

  it('a Page and its post at the same address collapse into one pin', () => {
    const pins = groupPins([row(), row({ resultKind: 'post', resultId: 'p1' })])
    expect(pins).toHaveLength(1)
    expect(pins[0].results).toHaveLength(2)
  })

  it('one Page at two addresses is two pins — the whole reason grouping is new work', () => {
    const pins = groupPins([
      row(),
      row({ resultKind: 'post', resultId: 'p1', locationId: 'loc-market', longitude: -121.5, latitude: 38.6 }),
    ])
    expect(pins).toHaveLength(2)
  })

  it('two Pages at the same address stay two pins', () => {
    const pins = groupPins([row(), row({ groupId: 'g2', resultId: 'r2', name: 'Other' })])
    expect(pins).toHaveLength(2)
  })

  it('groups on coordinates when the row carries no location id', () => {
    const pins = groupPins([
      row({ locationId: null }),
      row({ locationId: null, resultKind: 'post', resultId: 'p1' }),
    ])
    expect(pins).toHaveLength(1)
  })

  it('drops a result with no point rather than pinning a fallback coordinate', () => {
    expect(groupPins([row({ longitude: null, latitude: null })])).toEqual([])
  })

  it('keeps server order inside a pin', () => {
    const pins = groupPins([row({ resultId: 'a' }), row({ resultId: 'b' })])
    expect(pins[0].results.map((r) => r.resultId)).toEqual(['a', 'b'])
  })

  it('names the pin with the Page name', () => {
    expect(groupPins([row()])[0].name).toBe('Sourdough Co')
  })
})

// #475 — a place known only as an area is not a point: it groups with others at
// the same centroid, whatever Page they belong to, into one area marker.
describe('#475 — area markers', () => {
  const area = (over: Partial<BrowseResult> = {}) =>
    row({ locationKind: 'area', locationId: 'loc-midtown', locationLabel: 'Midtown', ...over })

  it('an exact address is an address pin; an area-only place is an area pin', () => {
    expect(groupPins([row({ locationKind: 'permanent' })])[0]!.kind).toBe('address')
    expect(groupPins([area()])[0]!.kind).toBe('area')
  })

  it('a row with no known kind is treated as an address, as before', () => {
    expect(groupPins([row()])[0]!.kind).toBe('address')
  })

  it('items from different Pages sharing a centroid are ONE area marker with a count', () => {
    const pins = groupPins([
      area({ groupId: 'g1', resultId: 'a' }),
      area({ groupId: 'g2', resultId: 'b', name: 'Other', locationId: 'loc-other', longitude: -121.4, latitude: 38.5 }),
      area({ groupId: 'g3', resultId: 'c', locationId: null }),
    ])
    expect(pins).toHaveLength(1)
    expect(pins[0]!.kind).toBe('area')
    expect(pins[0]!.results).toHaveLength(3)
  })

  it('an area marker is named for the place, not for one of its Pages, and links nowhere', () => {
    const [pin] = groupPins([area(), area({ resultId: 'b', groupId: 'g2' })])
    expect(pin!.name).toBe('Midtown')
    expect(pin!.href).toBeNull()
  })

  it('areas at different centroids stay separate, and never merge with an address pin', () => {
    const pins = groupPins([
      area(),
      area({ resultId: 'b', longitude: -121.9, latitude: 38.9, locationLabel: 'Davis' }),
      row({ locationKind: 'permanent', resultId: 'c' }),
    ])
    expect(pins.map((p) => p.kind).sort()).toEqual(['address', 'area', 'area'])
  })
})

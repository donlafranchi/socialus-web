// T119 — canonical Item URL construction + the browsable-kind gate.
// Scenario: planning/next/scenario-F054-member-taps-an-item-and-lands-on-it.md

import { describe, it, expect } from 'vitest'
import {
  itemHref,
  isBrowsableKind,
  BROWSABLE_KINDS,
  KIND_SEGMENTS,
  kindLabel,
} from './item-url'

const BASE = {
  kind: 'product',
  ownerHandle: 'maya',
  title: 'Country Sourdough Loaf',
  itemId: 'a0000001-0000-4000-8000-000000000001',
}

describe('T119 — itemHref, Member path (unchanged behaviour)', () => {
  it('builds the Member path when no Group fields are supplied', () => {
    expect(itemHref(BASE)).toBe('/m/maya/p/country-sourdough-loaf-a0000001')
  })

  it('uses the kind segment for each kind', () => {
    expect(itemHref({ ...BASE, kind: 'service' })).toContain('/s/')
    expect(itemHref({ ...BASE, kind: 'gathering' })).toContain('/e/')
    expect(itemHref({ ...BASE, kind: 'initiative' })).toContain('/initiative/')
  })

  it('falls back to the kind when the title slugifies to empty', () => {
    expect(itemHref({ ...BASE, title: '!!!' })).toBe('/m/maya/p/product-a0000001')
  })
})

describe('T119 — itemHref, Group place-path', () => {
  const GROUP = { groupSlug: 'the-good-loaf', groupPlacePath: 'tgp/the-good-place/market-square' }

  it('builds the Group place-path when both Group fields are present', () => {
    expect(itemHref({ ...BASE, ...GROUP })).toBe(
      '/p/tgp/the-good-place/market-square/g/the-good-loaf/p/country-sourdough-loaf-a0000001',
    )
  })

  it('keeps the id8 fragment as the addressing key on the Group path', () => {
    expect(itemHref({ ...BASE, ...GROUP })).toMatch(/-a0000001$/)
  })

  it('uses the gathering segment for a Group-filed event', () => {
    expect(itemHref({ ...BASE, ...GROUP, kind: 'gathering', title: 'Repair Cafe' })).toBe(
      '/p/tgp/the-good-place/market-square/g/the-good-loaf/e/repair-cafe-a0000001',
    )
  })

  it('falls back to the Member path when the place path is missing', () => {
    expect(itemHref({ ...BASE, groupSlug: 'the-good-loaf' })).toBe(
      '/m/maya/p/country-sourdough-loaf-a0000001',
    )
    expect(itemHref({ ...BASE, ...GROUP, groupPlacePath: null })).toBe(
      '/m/maya/p/country-sourdough-loaf-a0000001',
    )
  })

  it('falls back to the Member path when the group slug is missing', () => {
    expect(itemHref({ ...BASE, groupPlacePath: 'tgp/the-good-place' })).toBe(
      '/m/maya/p/country-sourdough-loaf-a0000001',
    )
  })

  it('falls back rather than emitting a malformed path for blank strings', () => {
    expect(itemHref({ ...BASE, groupSlug: '  ', groupPlacePath: 'tgp' })).toBe(
      '/m/maya/p/country-sourdough-loaf-a0000001',
    )
    expect(itemHref({ ...BASE, groupSlug: 'x', groupPlacePath: '  ' })).toBe(
      '/m/maya/p/country-sourdough-loaf-a0000001',
    )
  })

  it('never emits a double slash or a trailing slash', () => {
    const href = itemHref({ ...BASE, ...GROUP })
    expect(href).not.toMatch(/\/\//)
    expect(href).not.toMatch(/\/$/)
  })
})

describe('T119 — browsable kinds', () => {
  it('admits exactly the three kinds that have a detail page', () => {
    expect([...BROWSABLE_KINDS].sort()).toEqual(['gathering', 'product', 'service'])
  })

  it('withholds the four kinds with no detail page', () => {
    for (const kind of ['ask', 'offer', 'wonder', 'initiative']) {
      expect(isBrowsableKind(kind)).toBe(false)
    }
  })

  it('admits the three that resolve', () => {
    for (const kind of ['product', 'service', 'gathering']) {
      expect(isBrowsableKind(kind)).toBe(true)
    }
  })

  it('covers every kind in the URL segment map, so no kind is unclassified', () => {
    for (const kind of Object.keys(KIND_SEGMENTS)) {
      expect(typeof isBrowsableKind(kind)).toBe('boolean')
      expect(kindLabel(kind)).not.toBe('Item')
    }
  })

  it('withholds an unknown kind rather than admitting it', () => {
    expect(isBrowsableKind('cooperative_cohort')).toBe(false)
  })
})

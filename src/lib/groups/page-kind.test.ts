// #363 — three Page kinds (dispatch, 2026-10-05), stored in the existing column.
import { describe, it, expect } from 'vitest'
import { pageKindOf, storedKindFor, PAGE_KIND_LABEL, pageLayoutFor, upcomingPosts } from './page-kind'

describe('#363 — Business, Group, Organization', () => {
  it('reads every stored kind as one of the three', () => {
    expect(pageKindOf('business')).toBe('business')
    for (const k of ['interest', 'place', 'practice', 'family']) expect(pageKindOf(k)).toBe('group')
    expect(pageKindOf('event_anchored')).toBe('organization')
  })
  it('stores each of the three in the existing column', () => {
    expect(storedKindFor('business')).toBe('business')
    expect(storedKindFor('group')).toBe('interest')
    expect(storedKindFor('organization')).toBe('event_anchored')
  })
  it('round-trips', () => {
    for (const k of ['business', 'group', 'organization'] as const) expect(pageKindOf(storedKindFor(k))).toBe(k)
  })
  it('labels them plainly', () => {
    expect(PAGE_KIND_LABEL).toEqual({ business: 'Business', group: 'Group', organization: 'Organization' })
  })
})

describe('pageLayoutFor — per-kind lead and tools (dispatch, 2026-10-05)', () => {
  it('a group leads with Join and its next meetup, and lists no products & services', () => {
    expect(pageLayoutFor('interest')).toEqual({ lead: 'join', productsAndServices: false })
    expect(pageLayoutFor('practice')).toEqual({ lead: 'join', productsAndServices: false })
  })
  it('a business leads with contact', () => {
    expect(pageLayoutFor('business')).toEqual({ lead: 'contact', productsAndServices: true })
  })
  it('an organization leads with upcoming events', () => {
    expect(pageLayoutFor('event_anchored')).toEqual({ lead: 'events', productsAndServices: true })
  })
})

describe('upcomingPosts', () => {
  const now = new Date('2026-10-05T12:00:00Z')
  const p = (id: string, startsAt: string | null, endsAt: string | null = null) => ({ id, startsAt, endsAt })
  it('dated posts not yet over, soonest first; undated ones are not events', () => {
    const got = upcomingPosts([p('later', '2026-10-09T01:00:00Z'), p('undated', null), p('past', '2026-10-01T01:00:00Z'), p('soon', '2026-10-06T01:00:00Z'), p('on-now', '2026-10-05T10:00:00Z', '2026-10-05T14:00:00Z')], now)
    expect(got.map((x) => x.id)).toEqual(['on-now', 'soon', 'later'])
  })
})

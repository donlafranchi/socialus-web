// #363 — two Page types (ruled 2026-10-05), stored in the existing column.
import { describe, it, expect } from 'vitest'
import { pageKindOf, storedKindFor, PAGE_KIND_LABEL, kindLine, pageLayoutFor, upcomingPosts } from './page-kind'

describe('#363 — two types, Business and Social group; use cases are presets (ruled 2026-10-05)', () => {
  it('reads every stored kind as one of the two', () => {
    expect(pageKindOf('business')).toBe('business')
    for (const k of ['interest', 'place', 'practice', 'family', 'event_anchored']) expect(pageKindOf(k)).toBe('social')
  })
  it('a change of type keeps a social preset, and starts a new social group as interest', () => {
    expect(storedKindFor('business', 'practice')).toBe('business')
    expect(storedKindFor('social', 'business')).toBe('interest')
    expect(storedKindFor('social', 'event_anchored')).toBe('event_anchored')
  })
  it('labels them plainly', () => {
    expect(PAGE_KIND_LABEL).toEqual({ business: 'Business', social: 'Social group' })
  })
  it('the kind line is kind · main collection', () => {
    expect(kindLine('business', 'Bakery')).toBe('Business · Bakery')
    expect(kindLine('interest', null)).toBe('Social group')
  })
})

describe('pageLayoutFor — per-kind lead and tools (dispatch, 2026-10-05)', () => {
  it('a social group leads with Join and its next event, and lists no products & services', () => {
    expect(pageLayoutFor('interest')).toEqual({ lead: 'join', productsAndServices: false })
    expect(pageLayoutFor('practice')).toEqual({ lead: 'join', productsAndServices: false })
  })
  it('a business leads with contact', () => {
    expect(pageLayoutFor('business')).toEqual({ lead: 'contact', productsAndServices: true })
  })
  it('an organization preset leads with upcoming events', () => {
    expect(pageLayoutFor('event_anchored')).toEqual({ lead: 'events', productsAndServices: false })
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

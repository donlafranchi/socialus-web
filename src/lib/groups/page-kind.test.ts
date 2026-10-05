// #363 — two types, business and group; use cases are presets under them
// (ruled 2026-10-05; socialus-plan planning/PAGE-KINDS.md).
import { describe, it, expect } from 'vitest'
import { pageKindOf, presetOf, PAGE_KIND_LABEL, USE_CASES, kindLine, pageLayoutFor, upcomingPosts } from './page-kind'

describe('#363 — business and group, with presets', () => {
  it('reads business as business and everything else as group', () => {
    expect(pageKindOf('business')).toBe('business')
    for (const k of ['group', 'interest', 'family']) expect(pageKindOf(k)).toBe('group')
  })
  it('selling and service under business; gathering and testing interest under group', () => {
    expect(USE_CASES).toEqual({ business: ['selling', 'service'], group: ['gathering', 'testing_interest'] })
  })
  it('a use case that does not fit the type falls back to its first preset', () => {
    expect(presetOf('business', 'service')).toBe('service')
    expect(presetOf('business', 'gathering')).toBe('selling')
    expect(presetOf('group', null)).toBe('gathering')
  })
  it('labels the types plainly', () => {
    expect(PAGE_KIND_LABEL).toEqual({ business: 'Business', group: 'Group' })
  })
  it('the kind line is type · use case, or type · collection when it has one', () => {
    expect(kindLine('group', 'gathering', null)).toBe('Group · Events')
    expect(kindLine('business', 'service', null)).toBe('Business · Services')
    expect(kindLine('group', 'gathering', 'Running')).toBe('Group · Running')
    expect(kindLine('business', undefined, null)).toBe('Business')
  })
})

describe('pageLayoutFor — the type sets the defaults', () => {
  it('a group leads with Join and its next event', () => {
    expect(pageLayoutFor('group')).toEqual({ lead: 'join' })
  })
  it('a business leads with contact', () => {
    expect(pageLayoutFor('business')).toEqual({ lead: 'contact' })
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

// #363 — purpose first, type for listing (Don ruled A, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { pageKindOf, purposeOf, PAGE_KIND_LABEL, PURPOSES, TYPE_FOR_PURPOSE, kindLine, pageLayoutFor, upcomingPosts } from './page-kind'

describe('#363 — every Page has one purpose; the type follows it', () => {
  it('beta has four purposes, Create\'s four answers', () => {
    expect([...PURPOSES].sort()).toEqual(['create', 'gather', 'offer', 'sell'])
  })
  it('sell and offer are listed as businesses; gather and create as social groups', () => {
    expect(TYPE_FOR_PURPOSE).toEqual({ sell: 'business', offer: 'business', gather: 'group', create: 'group' })
  })
  it('reads business as business and everything else as group', () => {
    expect(pageKindOf('business')).toBe('business')
    for (const k of ['group', 'interest', 'family']) expect(pageKindOf(k)).toBe('group')
  })
  it('a missing or unknown purpose takes the type\'s: sell for a business, gather for a group', () => {
    expect(purposeOf('business', null)).toBe('sell')
    expect(purposeOf('group', 'bogus')).toBe('gather')
    expect(purposeOf('group', 'offer')).toBe('offer')
  })
  it('labels the types plainly', () => {
    expect(PAGE_KIND_LABEL).toEqual({ business: 'Business', group: 'Social group' })
  })
  it('the kind line is type · purpose, or type · collection when it has one', () => {
    expect(kindLine('group', 'gather', null)).toBe('Social group · Meets up')
    expect(kindLine('business', 'offer', null)).toBe('Business · Services and classes')
    expect(kindLine('group', 'gather', 'Running')).toBe('Social group · Running')
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

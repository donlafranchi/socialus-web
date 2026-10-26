import { describe, it, expect } from 'vitest'
import { leadKey, pickLead, recordSeen, seenBefore, LEAD_SIZE } from './lead'
import type { BrowseResult } from '@/lib/feed/browse-feed'

const NOW = new Date('2026-10-15T01:00:00Z') // Wednesday 18:00 in Sacramento
const LAST = new Date('2026-10-13T01:00:00Z')
const W = { tonight: { from: NOW.toISOString(), to: '2026-10-15T07:00:00Z' }, weekend: { from: '2026-10-17T07:00:00Z', to: '2026-10-20T07:00:00Z' } }

let n = 0
function r(over: Partial<BrowseResult> = {}): BrowseResult {
  n++
  return {
    resultKind: 'page', resultId: `id${n}`, groupId: `g${n}`, groupKind: 'business', slug: `s${n}`, name: `Name ${n}`, href: `/g/${n}`,
    photoUrl: null, description: null, body: null, tags: [], startsAt: null, locationId: null, locationLabel: null, longitude: null, latitude: null,
    pageCreatedAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z', postedAt: null, sortAt: '2026-09-02T00:00:00Z',
    withheld: false, announcementCount: null, announcementIds: null, ...over,
  }
}
const post = (over: Partial<BrowseResult> = {}) => r({ resultKind: 'post', postedAt: '2026-10-01T00:00:00Z', ...over })
const oldPages = (k: number) => Array.from({ length: k }, () => r())
const opts = (over: Partial<Parameters<typeof pickLead>[1]> = {}) => ({ now: NOW, lastVisit: LAST, seen: new Set<string>(), seed: 'aaaaaaaaaaaaaaaa', windows: W, ...over })

describe('#796 — the first look is what is new or happening soon', () => {
  it('leads with tonight, this weekend, last-minute openings and Pages new since the last visit; never an old post', () => {
    const tonight = post({ startsAt: '2026-10-15T03:00:00Z' })
    const weekend = post({ startsAt: '2026-10-18T18:00:00Z' })
    const lastMinute = post({ postedAt: '2026-10-14T20:00:00Z', startsAt: '2026-10-16T17:00:00Z' })
    const newPage = r({ pageCreatedAt: '2026-10-14T00:00:00Z' })
    const oldAnnouncement = post({ startsAt: null })
    const nextMonth = post({ startsAt: '2026-11-20T18:00:00Z' })
    const { lead, fresh } = pickLead([...oldPages(10), tonight, weekend, lastMinute, newPage, oldAnnouncement, nextMonth], opts())
    expect(fresh).toBe(true)
    expect(new Set(lead.map(leadKey))).toEqual(new Set([tonight, weekend, lastMinute, newPage].map(leadKey)))
  })

  // #814 — on tonight or this weekend counts, not only starting then: a market that opened this morning and runs to 9pm.
  it('leads with a post that is already on and runs into tonight or the weekend, but not one that has ended', () => {
    const onTonight = post({ startsAt: '2026-10-14T17:00:00Z', endsAt: '2026-10-15T04:00:00Z' })
    const weekendSpecial = post({ startsAt: '2026-10-14T17:00:00Z', endsAt: '2026-10-19T04:00:00Z' })
    const over = post({ startsAt: '2026-10-14T17:00:00Z', endsAt: '2026-10-14T20:00:00Z' })
    const { lead } = pickLead([...oldPages(10), onTonight, weekendSpecial, over], opts())
    const keys = lead.map(leadKey)
    expect(keys).toContain(leadKey(onTonight))
    expect(keys).toContain(leadKey(weekendSpecial))
    expect(keys).not.toContain(leadKey(over))
  })

  it('a post already seen on an earlier visit never leads again', () => {
    const tonight = post({ startsAt: '2026-10-15T03:00:00Z' })
    const { lead } = pickLead([...oldPages(10), tonight], opts({ seen: new Set([leadKey(tonight)]) }))
    expect(lead.map(leadKey)).not.toContain(leadKey(tonight))
  })

  it('with nothing new, falls back to a rotation of Pages: two visits in a row lead differently, and no post leads', () => {
    const rows = [...oldPages(30), post({ startsAt: null })]
    const a = pickLead(rows, opts({ seed: 'aaaaaaaaaaaaaaaa' }))
    const b = pickLead(rows, opts({ seed: 'bbbbbbbbbbbbbbbb' }))
    expect(a.fresh).toBe(false)
    expect(a.lead).toHaveLength(LEAD_SIZE)
    expect(a.lead.every((x) => x.resultKind === 'page')).toBe(true)
    expect(a.lead.map(leadKey)).not.toEqual(b.lead.map(leadKey))
  })

  it('reshuffles each visit when there is more new than fits', () => {
    const many = Array.from({ length: 20 }, () => r({ pageCreatedAt: '2026-10-14T00:00:00Z' }))
    const a = pickLead(many, opts({ seed: 'aaaaaaaaaaaaaaaa' })).lead.map(leadKey)
    const b = pickLead(many, opts({ seed: 'bbbbbbbbbbbbbbbb' })).lead.map(leadKey)
    expect(a).toHaveLength(LEAD_SIZE)
    expect(a).not.toEqual(b)
    // Same visit, same lead: a refresh does not reshuffle.
    expect(pickLead(many, opts({ seed: 'aaaaaaaaaaaaaaaa' })).lead.map(leadKey)).toEqual(a)
  })

  it('signed out, a Page that posted since the last visit leads as its "sign in to see" card, so the front door stays alive (F093.7)', () => {
    const card = post({ withheld: true, announcementCount: 2, sortAt: '2026-10-14T18:00:00Z', postedAt: null })
    const stale = post({ withheld: true, announcementCount: 1, sortAt: '2026-10-01T18:00:00Z', postedAt: null })
    const { lead } = pickLead([...oldPages(5), card, stale], opts())
    expect(lead.map(leadKey)).toEqual([leadKey(card)])
  })

  it('a first visit counts the last week as new', () => {
    const lastWeek = r({ pageCreatedAt: '2026-10-10T00:00:00Z' })
    const lastMonth = r({ pageCreatedAt: '2026-09-10T00:00:00Z' })
    const { lead } = pickLead([lastWeek, lastMonth, ...oldPages(5)], opts({ lastVisit: null }))
    expect(lead.map(leadKey)).toContain(leadKey(lastWeek))
    expect(lead.map(leadKey)).not.toContain(leadKey(lastMonth))
  })
})

describe('#796 — what was seen, by visit', () => {
  it('what this visit showed is not "seen" until the next visit, so a refresh keeps the lead', () => {
    const c = recordSeen(undefined, 'aaaaaaaaaaaaaaaa', ['k1', 'k2'])
    expect(seenBefore(c, 'aaaaaaaaaaaaaaaa').size).toBe(0)
    expect(seenBefore(c, 'bbbbbbbbbbbbbbbb')).toEqual(new Set(['k1', 'k2']))
    const later = recordSeen(c, 'bbbbbbbbbbbbbbbb', ['k3'])
    expect(seenBefore(later, 'bbbbbbbbbbbbbbbb')).toEqual(new Set(['k1', 'k2']))
    expect(seenBefore(later, 'cccccccccccccccc')).toEqual(new Set(['k1', 'k2', 'k3']))
  })
  it('stays small: the oldest keys drop past the cap, and junk is ignored', () => {
    let c: string | undefined
    for (let i = 0; i < 50; i++) c = recordSeen(c, `seed${String(i).padStart(12, '0')}`, [`a${i}`, `b${i}`])
    const seen = seenBefore(c, 'zzzzzzzzzzzzzzzz')
    expect(seen.size).toBeLessThanOrEqual(80)
    expect(seen.has('a49')).toBe(true)
    expect(seen.has('a0')).toBe(false)
    expect(c!.length).toBeLessThan(1200)
    expect(seenBefore('garbage;;', 'x').size).toBe(0)
  })
})

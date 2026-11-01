import { describe, it, expect } from 'vitest'
import { groupResults } from './groups'
import { CALENDAR_LINE } from '@/lib/unclaimed/event-type'
import type { BrowseResult } from '@/lib/feed/browse-feed'

// Wednesday 2026-10-28, 10am in Sacramento: the weekend is Oct 31–Nov 1, the week runs to Monday midnight.
const NOW = new Date('2026-10-28T17:00:00Z')

function row(over: Partial<BrowseResult>): BrowseResult {
  return {
    resultKind: 'post',
    resultId: Math.random().toString(36).slice(2),
    groupId: 'g',
    groupKind: 'business',
    slug: 's',
    name: 'Page',
    href: '/p/x',
    photoUrl: null,
    description: null,
    body: null,
    tags: [],
    startsAt: null,
    locationId: null,
    locationLabel: null,
    longitude: null,
    latitude: null,
    pageCreatedAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    postedAt: null,
    sortAt: '2026-09-01T00:00:00Z',
    withheld: false,
    announcementCount: null,
    announcementIds: null,
    ...over,
  }
}

const show = (title: string, startsAt: string, tags: string[] = []) =>
  row({ postKind: 'event', startsAt, tags, body: `${title} at Ace\n\nSat 8pm\n\n${CALENDAR_LINE('Ace')}https://ace.example` })

const keys = (rs: BrowseResult[]) => groupResults(rs, NOW).map((g) => g.key)

describe('groupResults', () => {
  it('never mixes Pages and posts in one group', () => {
    const groups = groupResults(
      [row({ resultKind: 'page' }), row({ postKind: 'event', startsAt: '2026-10-31T22:00:00Z' }), row({ postKind: 'news' })],
      NOW,
    )
    for (const g of groups) expect(new Set(g.results.map((r) => r.resultKind)).size).toBe(1)
    expect(groups.find((g) => g.key === 'pages')!.results).toHaveLength(1)
  })

  it('splits dated posts by when, then by kind of show', () => {
    const rs = [
      show('The Band', '2026-10-31T22:00:00Z', ['Live music']),
      show('Les Mis the Musical', '2026-10-30T03:00:00Z'),
      show('Stand-up Night', '2026-11-20T03:00:00Z'),
      row({ resultKind: 'page' }),
    ]
    expect(keys(rs)).toEqual(['week', 'weekend', 'later', 'pages', 'concerts', 'theater', 'comedy'])
  })

  it('puts a post in one time group and one kind group, never two of either', () => {
    const r = show('The Band', '2026-10-31T22:00:00Z', ['Live music'])
    const groups = groupResults([r], NOW)
    expect(groups.map((g) => g.key)).toEqual(['weekend', 'concerts'])
  })

  it('finds open mics by their words, from members and venues alike', () => {
    const r = row({ postKind: 'event', startsAt: '2026-11-20T03:00:00Z', headline: 'Open mic night' })
    expect(keys([r])).toContain('open-mics')
    expect(keys([r])).not.toContain('more-events')
  })

  it('says today first, and a post today is not repeated under this week', () => {
    expect(keys([row({ postKind: 'event', startsAt: '2026-10-29T02:00:00Z' })])).toEqual(['today', 'more-events'])
  })

  it('leaves out a group with nothing in it', () => {
    expect(keys([row({ resultKind: 'page' })])).toEqual(['pages'])
    expect(groupResults([], NOW)).toEqual([])
  })

  it('groups undated posts by their kind', () => {
    expect(keys([row({ postKind: 'sale' }), row({ postKind: 'hiring' })])).toEqual(['sale', 'hiring'])
  })

  it('keeps the order results arrived in inside a group', () => {
    const a = row({ resultKind: 'page', name: 'A' })
    const b = row({ resultKind: 'page', name: 'B' })
    expect(groupResults([b, a], NOW)[0]!.results.map((r) => r.name)).toEqual(['B', 'A'])
  })

  it('drops past events from the time groups but keeps them findable by kind', () => {
    const r = row({ postKind: 'event', startsAt: '2026-10-01T03:00:00Z' })
    expect(keys([r])).toEqual(['more-events'])
  })
})

import { describe, it, expect } from 'vitest'
import { groupResults } from './groups'
import { COPY } from '@/lib/copy'
import { CALENDAR_LINE } from '@/lib/unclaimed/event-type'
import type { BrowseResult } from '@/lib/feed/browse-feed'
import { planMakers } from '@/lib/unclaimed/plan'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

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
    expect(groups.filter((g) => g.key.startsWith('pages')).flatMap((g) => g.results)).toHaveLength(1)
  })

  it('splits dated posts by when, then by kind of show', () => {
    const rs = [
      show('The Band', '2026-10-31T22:00:00Z', ['Live music']),
      show('Les Mis the Musical', '2026-10-30T03:00:00Z'),
      show('Stand-up Night', '2026-11-20T03:00:00Z'),
      row({ resultKind: 'page' }),
    ]
    expect(keys(rs)).toEqual(['next-7', 'weekend', 'later', 'pages', 'concerts', 'theater', 'comedy'])
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

  it('the next 7 days run past the weekend, and the weekend is not repeated in them', () => {
    expect(keys([row({ postKind: 'event', startsAt: '2026-11-03T03:00:00Z' })])).toEqual(['next-7', 'more-events'])
    expect(keys([row({ postKind: 'event', startsAt: '2026-11-06T03:00:00Z' })])).toEqual(['later', 'more-events'])
  })

  it('says today first, and a post today is not repeated under the next 7 days', () => {
    expect(keys([row({ postKind: 'event', startsAt: '2026-10-29T02:00:00Z' })])).toEqual(['today', 'more-events'])
  })

  it('leaves out a group with nothing in it', () => {
    expect(keys([row({ resultKind: 'page' })])).toEqual(['pages'])
    expect(groupResults([], NOW)).toEqual([])
  })

  it('a signed-out card that holds a post back is never filed under a kind it might not be', () => {
    const groups = groupResults([row({ withheld: true, announcementCount: 2 }), row({ withheld: true })], NOW)
    expect(groups.map((g) => g.key)).toEqual(['withheld'])
    expect(groups[0]!.label).toBe(COPY.withheldCta)
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

const page = (name: string, description: string, tags: string[] = []) => row({ resultKind: 'page', name, description, tags })

describe('groupResults — Pages by kind', () => {
  it('splits venues by kind: arenas, theaters, music clubs, bars with live music, comedy clubs', () => {
    const groups = groupResults(
      [
        page('Golden 1 Center', "Golden 1 Center: downtown Sacramento's arena for world-class music, in Sacramento.", ['Live music']),
        page('Nevada Theatre', 'Nevada Theatre: the oldest continuously operated theatre on the West Coast, in Nevada City.', ['Live music']),
        page('Ace of Spades', 'Ace of Spades: a downtown Sacramento concert club with touring rock, in Sacramento.', ['Live music']),
        page('Powerhouse Pub', 'Powerhouse Pub: an eclectic maze of bars with live bands, in Folsom.', ['Live music']),
        page('Punchline', 'Punchline: a stand-up comedy club, in Sacramento.', ['Comedy']),
      ],
      NOW,
    )
    expect(groups.map((g) => [g.key, g.results.map((r) => r.name)])).toEqual([
      ['pages:arenas', ['Golden 1 Center']],
      ['pages:theaters', ['Nevada Theatre']],
      ['pages:clubs', ['Ace of Spades']],
      ['pages:bars', ['Powerhouse Pub']],
      ['pages:comedy', ['Punchline']],
    ])
  })

  it('a pub with no music is a place to eat and drink, not a venue', () => {
    expect(keys([page('The Local', 'The Local: a neighbourhood pub with burgers, in Davis.', ['Food & drink']), page('Ace', 'A taproom.', ['Food & drink'])])).toEqual(['pages:tag:food & drink'])
  })

  it('other Pages group by their first interest; a kind with one Page folds into the rest', () => {
    const groups = groupResults(
      [
        page('Bakery', 'Bread.', ['Food & drink']),
        page('Taqueria', 'Tacos.', ['Food & drink']),
        page('Garden club', 'Plants.', ['Gardening']),
        page('No tags', 'Something.'),
      ],
      NOW,
    )
    expect(groups.map((g) => [g.label, g.results.length])).toEqual([
      ['Food & drink', 2],
      ['More places & groups', 2],
    ])
  })

  it('with only one kind of Page, the row is just Places & groups', () => {
    expect(groupResults([page('A', 'a', ['Gardening']), page('B', 'b')], NOW).map((g) => g.label)).toEqual(['Places & groups'])
  })

  it('every imported venue gets a venue kind from what its Page says', () => {
    const dir = join(process.cwd(), 'scripts/unclaimed')
    const rows = readdirSync(dir)
      .filter((f) => /venues\.json$/.test(f))
      .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    expect(rows.length).toBeGreaterThan(10)
    const { listed } = planMakers(rows)
    for (const p of listed) {
      const [g] = groupResults([page(p.name, p.description, p.interests)], NOW)
      expect([p.name, g!.key]).toEqual([p.name, expect.stringMatching(/^pages:(arenas|theaters|clubs|bars|comedy)$/)])
    }
  })
})

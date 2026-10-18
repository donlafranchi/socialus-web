// #892 — "My interests" only filters: it keeps whatever order the list already has, and with none chosen it
// leads the member to pick some.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BrowseSurface } from './BrowseSurface'
import type { BrowseSnapshot } from '@/app/explore/load'
import type { BrowseResult } from '@/lib/feed/browse-feed'

const replace = vi.fn()
let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}))

const browseFeedAction = vi.fn()
const browseMapAction = vi.fn(async () => [])
const markLeadSeenAction = vi.fn(async () => {})
vi.mock('@/app/explore/actions', () => ({
  browseMapAction: () => browseMapAction(),
  browseFeedAction: (...args: unknown[]) => browseFeedAction(...args),
  searchAreasAction: async () => [{ id: 'p-1', name: 'Midtown' }],
  markLeadSeenAction: () => markLeadSeenAction(),
}))

vi.mock('@/hooks/useScrollRestoration', () => ({ useScrollRestoration: () => {} }))

const SAC = { id: 'm1', slug: 'sacramento-roseville-ca', name: 'Sacramento-Roseville, CA', isOpen: true }
const PDX = { id: 'm2', slug: 'portland-vancouver-or-wa', name: 'Portland-Vancouver, OR-WA', isOpen: true }

function result(over: Partial<BrowseResult> = {}): BrowseResult {
  return {
    resultKind: 'page',
    resultId: 'r1',
    groupId: 'g1',
    groupKind: 'business',
    slug: 'sourdough-co',
    name: 'Sourdough Co',
    href: '/p/ca/sac/g/sourdough-co',
    photoUrl: null,
    description: 'Bread, daily',
    body: null,
    tags: ['local food'],
    startsAt: null,
    locationId: 'loc1',
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

function snapshot(over: Partial<BrowseSnapshot> = {}): BrowseSnapshot {
  return {
    results: [result()],
    // T169 — empty by default, which is every signed-out load. The row hides.
    following: [],
    happening: { today: [], thisWeek: [], thisWeekend: [] },
    map: [],
    area: null,
    metro: SAC,
    chosen: false,
    metros: [SAC, PDX],
    signedIn: false,
    failed: false,
    ...over,
  }
}

beforeEach(() => {
  search = ''
  markLeadSeenAction.mockClear()
  browseFeedAction.mockReset()
})
afterEach(cleanup)


const tagged = (id: string, tags: string[]) => result({ resultId: id, groupId: id, name: `Page ${id}`, slug: id, href: `/g/${id}`, tags })

describe('#892 — My interests on Explore', () => {
  it('keeps the list in the order it already has, dropping only what does not match, with no new read', async () => {
    search = 'q=my+interests'
    const results = [tagged('d', ['Gardening']), tagged('b', ['coffee']), tagged('a', ['live music']), tagged('c', ['gardening', 'arts & culture'])]
    // A read in another order, as a targeted read would bring: it must not replace the list's own order.
    browseFeedAction.mockResolvedValue(snapshot({ results: [results[3]!, results[2]!, results[0]!] }))
    render(<BrowseSurface initial={snapshot({ signedIn: true, chosen: true, results, lead: [], leadFresh: false, myInterests: ['gardening', 'live music'] })} />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    const cards = within(screen.getByTestId('browse-list-pane')).getAllByText(/^Page \w$/).map((e) => e.textContent)
    expect(cards).toEqual(['Page d', 'Page a', 'Page c'])
    expect(browseFeedAction).not.toHaveBeenCalled()
  })

  it('with none chosen, the empty list leads the member to pick some', () => {
    search = 'q=my+interests'
    render(<BrowseSurface initial={snapshot({ signedIn: true, chosen: true, results: [tagged('a', ['coffee'])], lead: [], leadFresh: false, myInterests: [] })} />)
    expect(within(screen.getByTestId('browse-pick-interests')).getByRole('link', { name: /pick your interests/i })).toHaveAttribute('href', '/you#interests')
  })
  it('composes with a chosen reach: filters the list as returned, asks for no wider read', async () => {
    search = 'q=my+interests&reach=15'
    const results = [tagged('d', ['gardening']), tagged('b', ['coffee'])]
    render(<BrowseSurface initial={snapshot({ signedIn: true, chosen: true, results, lead: [], leadFresh: false, myInterests: ['gardening'], reach: { minutes: 15, from: null } })} />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(within(screen.getByTestId('browse-list-pane')).getAllByText(/^Page \w$/).map((e) => e.textContent)).toEqual(['Page d'])
    expect(browseFeedAction).not.toHaveBeenCalled()
  })
})

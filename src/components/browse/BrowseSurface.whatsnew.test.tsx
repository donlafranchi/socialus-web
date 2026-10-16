// #796 — Explore's first look (ruled A, Don 2026-10-14), and #876 — everything mixed, posts-only as a filter (Don, 2026-10-16).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
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
const browseMapAction = vi.fn(async (..._args: unknown[]) => [])
const markLeadSeenAction = vi.fn(async (..._args: unknown[]) => {})
vi.mock('@/app/explore/actions', () => ({
  browseMapAction: (...args: unknown[]) => browseMapAction(...args),
  browseFeedAction: (...args: unknown[]) => browseFeedAction(...args),
  searchAreasAction: async () => [{ id: 'p-1', name: 'Midtown' }],
  markLeadSeenAction: (...args: unknown[]) => markLeadSeenAction(...args),
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

const page = (id: string, name = `Page ${id}`) => result({ resultId: id, groupId: id, name, slug: id, href: `/g/${id}`, tags: [] })
const post = (id: string, postedAt: string, name = `Post ${id}`) =>
  result({ resultKind: 'post', resultId: id, groupId: `g-${id}`, name, slug: `g-${id}`, href: `/g/g-${id}#post-${id}`, body: `Body of ${id}`, postedAt, sortAt: postedAt, tags: [] })

describe('#796 — Explore opens on what is new since you were here', () => {
  it('leads with what is new, then everything mixed: Pages and posts in one list', () => {
    const fresh = page('new', 'New Bakery')
    const results = [page('a', 'Old A'), page('b', 'Old B'), post('p1', '2026-10-14T00:00:00Z', 'Announcement One'), fresh]
    render(<BrowseSurface initial={snapshot({ signedIn: true, results, lead: [fresh], leadFresh: true, following: [post('f1', '2026-10-14T00:00:00Z', 'Followed Post')] })} />)
    const lead = screen.getByTestId('explore-lead')
    expect(within(lead).getByText('New Bakery')).toBeInTheDocument()
    const list = screen.getByTestId('browse-list-pane')
    expect(within(list).getByText('Old A')).toBeInTheDocument()
    // #876 — posts are in the mix; the loader already merged the followed Pages' updates into results.
    expect(within(list).getByText('Announcement One')).toBeInTheDocument()
    expect(screen.queryByTestId('browse-following')).toBeNull()
    // One results grid: the lead's is its own, so card-grid still means the results (F059 evals, tap speed).
    expect(screen.getAllByTestId('card-grid')).toHaveLength(1)
    expect(within(lead).getByTestId('explore-lead-grid')).toBeInTheDocument()
    // The lead is not shown twice.
    expect(screen.getAllByText('New Bakery')).toHaveLength(1)
    expect(within(list).queryByText('New Bakery')).toBeNull()
  })

  it('with nothing new, the rotation leads the list: a full screen, no "new" heading', () => {
    const pages = Array.from({ length: 8 }, (_, i) => page(`p${i}`, `Rotation ${i}`))
    render(<BrowseSurface initial={snapshot({ results: pages, lead: [pages[5]!, pages[2]!], leadFresh: false })} />)
    expect(screen.queryByTestId('explore-lead')).toBeNull()
    const cards = within(screen.getByTestId('browse-list-pane')).getAllByText(/^Rotation \d$/).map((e) => e.textContent)
    expect(cards).toHaveLength(8)
    expect(cards.slice(0, 2)).toEqual(['Rotation 5', 'Rotation 2'])
  })

  it('?view=updates is the posts-only filter: posts only, searchable, and the targeted read is asked for', async () => {
    search = 'view=updates'
    browseFeedAction.mockReturnValue(new Promise(() => {}))
    const results = [page('a', 'Old A'), post('old', '2026-10-01T00:00:00Z', 'Older News'), post('new', '2026-10-12T00:00:00Z', 'Newer News')]
    render(<BrowseSurface initial={snapshot({ signedIn: true, chosen: true, results, lead: [], leadFresh: false })} />)
    const list = screen.getByTestId('browse-list-pane')
    expect(within(list).queryByText('Old A')).toBeNull()
    expect(within(list).getAllByText(/News$/)).toHaveLength(2)
    await waitFor(() => expect(browseFeedAction).toHaveBeenCalledWith(SAC.slug, null, expect.objectContaining({ type: 'posts' })))
    const box = screen.getByRole('searchbox') as HTMLInputElement
    fireEvent.change(box, { target: { value: 'older posts' } })
    expect(within(list).queryByText('Newer News')).toBeNull()
    expect(within(list).getByText('Older News')).toBeInTheDocument()
  })

  it('shows the targeted read when it comes back', async () => {
    search = 'q=deals'
    browseFeedAction.mockResolvedValue(snapshot({ signedIn: true, results: [post('d', '2026-10-15T00:00:00Z', 'Server Deal')] }))
    render(<BrowseSurface initial={snapshot({ signedIn: true, results: [page('a', 'Old A')], lead: [], leadFresh: false })} />)
    expect(await screen.findByText('Server Deal')).toBeInTheDocument()
    expect(browseFeedAction).toHaveBeenCalledWith(null, null, expect.objectContaining({ postKinds: ['deal'] }))
  })

  it('tells the server what the first look showed, once, after it is on screen', async () => {
    const fresh = page('new', 'New Bakery')
    render(<BrowseSurface initial={snapshot({ results: [fresh], lead: [fresh], leadFresh: true })} />)
    await waitFor(() => expect(markLeadSeenAction).toHaveBeenCalledTimes(1))
    expect((markLeadSeenAction.mock.calls[0] as unknown as [string[]])[0]).toHaveLength(1)
  })
})

// #947 — a search never says "0 results" before the server has answered, and says so when it cannot.
// The rows on screen are only the nearby ring (#922), so cutting them for a word was a confident false zero.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BrowseSurface } from './BrowseSurface'
import type { BrowseSnapshot } from '@/app/explore/load'
import type { BrowseResult } from '@/lib/feed/browse-feed'

const replace = vi.fn()
// #796 — posts and the personal row live behind the Updates filter; tests that need them open it.
let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
  unstable_isUnrecognizedActionError: (e: unknown) => e instanceof Error && e.name === 'UnrecognizedActionError',
}))

const browseFeedAction = vi.fn()
const browseMapAction = vi.fn()
vi.mock('@/app/explore/actions', () => ({
  browseMapAction: (...args: unknown[]) => browseMapAction(...args),
  browseFeedAction: (...args: unknown[]) => browseFeedAction(...args),
  searchAreasAction: async () => [{ id: 'p-1', name: 'Midtown' }],
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
  replace.mockClear()
  browseFeedAction.mockReset()
})
afterEach(cleanup)

const type = (value: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  fireEvent.change(screen.getByTestId('search-input'), { target: { value } })
}
const stale = () => Object.assign(new Error('Server Action "abc" was not found on the server.'), { name: 'UnrecognizedActionError' })

describe('#947 — searching, not a false zero', () => {
  it('while the answer is out, it says it is searching, not "0 results" or "Nothing matches"', async () => {
    browseFeedAction.mockReturnValue(new Promise(() => {}))
    render(<BrowseSurface initial={snapshot()} />)
    type('flowers')
    await waitFor(() => expect(browseFeedAction).toHaveBeenCalled())
    expect(screen.getByTestId('result-count')).toHaveTextContent('Searching…')
    expect(screen.queryByText(/0 results/)).toBeNull()
    expect(screen.queryByTestId('browse-empty')).toBeNull()
  })

  it('once the answer lands, its rows and count show', async () => {
    browseFeedAction.mockResolvedValue(snapshot({ results: [result({ resultId: 'f1', name: 'Park Winters Flower Farm' })] }))
    render(<BrowseSurface initial={snapshot()} />)
    type('flowers')
    expect(await screen.findByText('Park Winters Flower Farm')).toBeInTheDocument()
    expect(screen.getByTestId('result-count')).toHaveTextContent('1 result match')
  })

  it('a real zero from the server still says nothing matches', async () => {
    browseFeedAction.mockResolvedValue(snapshot({ results: [] }))
    render(<BrowseSurface initial={snapshot()} />)
    type('qqqzzz')
    expect(await screen.findByTestId('browse-empty')).toBeInTheDocument()
  })

  it('a failed search says so and offers Try again, which asks again', async () => {
    browseFeedAction.mockRejectedValueOnce(new Error('network')).mockResolvedValue(snapshot({ results: [result({ resultId: 'f1', name: 'Park Winters Flower Farm' })] }))
    render(<BrowseSurface initial={snapshot()} />)
    type('flowers')
    const failed = await screen.findByTestId('browse-search-failed')
    expect(screen.queryByText(/0 results/)).toBeNull()
    expect(screen.queryByTestId('browse-empty')).toBeNull()
    fireEvent.click(within(failed).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Park Winters Flower Farm')).toBeInTheDocument()
  })

  it('a server answer marked failed is a failure too, not an empty list', async () => {
    browseFeedAction.mockResolvedValue(snapshot({ results: [], failed: true }))
    render(<BrowseSurface initial={snapshot()} />)
    type('flowers')
    expect(await screen.findByTestId('browse-search-failed')).toBeInTheDocument()
    expect(screen.queryByTestId('browse-empty')).toBeNull()
  })

  it('a newer deploy than the page: it retries once, then offers a reload', async () => {
    browseFeedAction.mockRejectedValue(stale())
    render(<BrowseSurface initial={snapshot()} />)
    type('flowers')
    const failed = await screen.findByTestId('browse-search-failed')
    expect(browseFeedAction).toHaveBeenCalledTimes(2)
    expect(within(failed).getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('a newer deploy that answers on the retry just shows the rows', async () => {
    browseFeedAction.mockRejectedValueOnce(stale()).mockResolvedValue(snapshot({ results: [result({ resultId: 'v1', name: 'Vino Tahoe' })] }))
    render(<BrowseSurface initial={snapshot()} />)
    type('vino')
    expect(await screen.findByText('Vino Tahoe')).toBeInTheDocument()
    expect(screen.queryByTestId('browse-search-failed')).toBeNull()
  })
})

describe('#947 — what else waits for the answer', () => {
  it('the screen reader count and the search-demand count wait too', async () => {
    browseFeedAction.mockReturnValue(new Promise(() => {}))
    render(<BrowseSurface initial={snapshot()} />)
    type('flowers')
    await new Promise((ok) => setTimeout(ok, 900))
    expect(screen.getByTestId('browse-announcement')).not.toHaveTextContent(/0 results/)
  })
})

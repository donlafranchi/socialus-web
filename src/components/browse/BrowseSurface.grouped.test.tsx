// Don (2026-11-01): searching "music" comes back sorted into labelled rows, Pages and posts never in one row,
// with a way back to one flat list.

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
  usePathname: () => '/explore',
  useSearchParams: () => new URLSearchParams(search),
  unstable_isUnrecognizedActionError: (e: unknown) => e instanceof Error && e.name === 'UnrecognizedActionError',
}))

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: false }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))

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
  fireEvent.change(screen.getByTestId('search-input'), { target: { value } })
}

const venue = result({ resultId: 'v1', name: 'Harlow Hall', tags: ['Live music'] })
const soon = new Date(Date.now() + 2 * 3600_000).toISOString()
const gig = result({ resultKind: 'post', resultId: 'e1', name: 'Harlow Hall', postKind: 'event', startsAt: soon, headline: 'Open mic night', tags: ['Live music'] })

describe('a search comes back in labelled rows', () => {
  it('groups Pages and posts into separate rows, and never mixes them', async () => {
    browseFeedAction.mockResolvedValue(snapshot({ results: [venue, gig] }))
    render(<BrowseSurface initial={snapshot()} />)
    type('music')
    const rows = await screen.findAllByTestId('shelf-row')
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(expect.arrayContaining(['Places & groups', 'Open mics']))
    const places = rows.find((r) => r.getAttribute('aria-label') === 'Places & groups')!
    expect(within(places).getByText('Harlow Hall')).toBeInTheDocument()
    expect(within(places).queryByText('Open mic night')).toBeNull()
    expect(screen.queryByTestId('card-grid')).toBeNull()
  })

  it('offers everything as one flat list, and back', async () => {
    browseFeedAction.mockResolvedValue(snapshot({ results: [venue, gig] }))
    render(<BrowseSurface initial={snapshot()} />)
    type('music')
    await screen.findAllByTestId('shelf-row')
    fireEvent.click(screen.getByRole('button', { name: 'Show as one list' }))
    expect(screen.queryByTestId('shelf-row')).toBeNull()
    expect(within(screen.getByTestId('card-grid')).getAllByRole('link').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Show in groups' }))
    expect(screen.getAllByTestId('shelf-row').length).toBeGreaterThan(1)
  })

  it('a search with only one kind of answer stays one list', async () => {
    browseFeedAction.mockResolvedValue(snapshot({ results: [venue, result({ resultId: 'v2', name: 'Torch Club' })] }))
    render(<BrowseSurface initial={snapshot()} />)
    type('music')
    expect(await screen.findByText('Torch Club')).toBeInTheDocument()
    expect(screen.queryByTestId('shelf-row')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show as one list' })).toBeNull()
  })

  // Review of #1155 — a shared link's open list must not pop up again after the search changes.
  it('a new search drops the open list from the address', async () => {
    window.history.replaceState(null, '', '/explore?q=jazz&shelf=today')
    browseFeedAction.mockResolvedValue(snapshot({ results: [venue, gig] }))
    render(<BrowseSurface initial={snapshot()} />)
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('shelf')).toBe('today'))
    type('music')
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('shelf')).toBeNull())
    await screen.findAllByTestId('shelf-row')
    expect(screen.queryByTestId('shelf-screen')).toBeNull()
  })

  it('no search, no groups: the opening list is unchanged', () => {
    render(<BrowseSurface initial={snapshot({ results: [venue, gig] })} />)
    expect(screen.queryByTestId('shelf-row')).toBeNull()
    expect(screen.getByTestId('card-grid')).toBeInTheDocument()
  })
})

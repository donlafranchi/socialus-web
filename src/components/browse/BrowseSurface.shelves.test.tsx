// F121 — Explore's shelves sit under the first look on the default view, and step aside for a search or filter.

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


vi.mock('@/app/_actions/shelf-actions', () => ({ logShelfAction: async () => {} }))

beforeEach(() => {
  search = ''
})
afterEach(cleanup)

const SHELVES = <div data-testid="the-shelves">shelves</div>

describe('F121 — shelves on Explore', () => {
  it('the default view shows the shelves', () => {
    render(<BrowseSurface initial={snapshot({ signedIn: true })} shelves={SHELVES} />)
    expect(screen.getByTestId('the-shelves')).toBeInTheDocument()
  })

  it('a search or a filter hides them: the answer is the list', () => {
    search = 'q=pottery'
    render(<BrowseSurface initial={snapshot({ signedIn: true })} shelves={SHELVES} />)
    expect(screen.queryByTestId('the-shelves')).toBeNull()
    cleanup()
    search = 'q=events'
    render(<BrowseSurface initial={snapshot({ signedIn: true })} shelves={SHELVES} />)
    expect(screen.queryByTestId('the-shelves')).toBeNull()
  })
})

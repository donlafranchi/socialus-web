// T187 — Explore's list and map follow the screen width (F059 criterion 5,
// restated 2026-10-01). Widths are driven through a stubbed matchMedia.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BrowseSurface } from './BrowseSurface'
import type { BrowseSnapshot } from '@/app/explore/load'
import type { BrowseResult } from '@/lib/feed/browse-feed'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/explore/actions', () => ({ browseFeedAction: vi.fn() }))
vi.mock('@/hooks/useScrollRestoration', () => ({ useScrollRestoration: () => {} }))
vi.mock('next/dynamic', () => ({
  default: () =>
    function MapStub() {
      return <div data-testid="browse-map" />
    },
}))

let width = 390
function stubWidth(w: number) {
  width = w
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0)
    return {
      matches: width >= min,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
  }) as typeof window.matchMedia
}

function result(i: number): BrowseResult {
  return {
    resultKind: 'page',
    resultId: `r${i}`,
    groupId: `g${i}`,
    groupKind: 'business',
    slug: `page-${i}`,
    name: `Page ${i}`,
    href: `/p/ca/sac/g/page-${i}`,
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
    updatedAt: '2026-09-02T00:00:00Z',
    postedAt: null,
    sortAt: '2026-09-02T00:00:00Z',
    withheld: false,
    announcementCount: null,
    announcementIds: null,
  } as BrowseResult
}

const SAC = { id: 'm1', slug: 'sacramento-roseville-ca', name: 'Sacramento-Roseville, CA', isOpen: true }
const snapshot: BrowseSnapshot = {
  results: Array.from({ length: 10 }, (_, i) => result(i)),
  following: [],
  metro: SAC,
  chosen: false,
  metros: [SAC],
  signedIn: false,
  failed: false,
  happening: { today: [], thisWeek: [], thisWeekend: [] },
}

const renderAt = (w: number, props: { ownerPanelOpen?: boolean } = {}) => {
  stubWidth(w)
  return render(<BrowseSurface initial={snapshot} {...props} />)
}

beforeEach(() => stubWidth(390))
afterEach(cleanup)

// [guards F059.5 partial: where things land on a real screen, which the F059 eval checks]

describe('T187 — nothing sits between rows of results', () => {
  for (const w of [390, 1280]) {
    it(`the card grid holds only cards at ${w}px`, () => {
      renderAt(w)
      const grid = screen.getByTestId('card-grid')
      expect(within(grid).queryByRole('tab')).toBeNull()
      expect(within(grid).queryByRole('button', { name: /^(map|list)$/i })).toBeNull()
      expect(grid.querySelector('[role="presentation"]')).toBeNull()
    })
  }
})

describe('T187 — under 1024px, a floating pill', () => {
  it('floats at bottom centre, above the nav and the safe area', () => {
    renderAt(390)
    const pill = screen.getByTestId('view-pill')
    expect(pill.className).toMatch(/\bfixed\b/)
    expect(pill.className).toMatch(/left-1\/2/)
    expect(pill.className).toContain('var(--nav-height)')
    expect(pill.className).toContain('env(safe-area-inset-bottom)')
    expect(pill.closest('[data-testid="card-grid"]')).toBeNull()
  })

  it('reads Map over the list and List over the map, swapping the view', () => {
    renderAt(744)
    expect(screen.queryByTestId('browse-map')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Map' }))
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
    expect(screen.queryByTestId('card-grid')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByTestId('card-grid')).toBeInTheDocument()
    expect(screen.queryByTestId('browse-map')).toBeNull()
  })
})

describe('T187 — 1024px and up, side by side', () => {
  it('shows list and map together, with no toggle', () => {
    renderAt(1024)
    expect(screen.getByTestId('card-grid')).toBeInTheDocument()
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
    expect(screen.queryByTestId('view-pill')).toBeNull()
    expect(screen.queryByRole('tablist', { name: /view/i })).toBeNull()
  })

  it('collapses and restores the map from the handle on the divider', () => {
    renderAt(1440)
    const handle = screen.getByRole('button', { name: 'Hide map' })
    expect(handle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(handle)
    expect(screen.queryByTestId('browse-map')).toBeNull()
    expect(screen.getByTestId('card-grid')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show map' }))
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
  })
})

describe('T187 — 1024–1439px with the owner panel open', () => {
  it('collapses the map and docks a List | Map switch in the sticky filter bar', () => {
    renderAt(1280, { ownerPanelOpen: true })
    expect(screen.queryByTestId('browse-map')).toBeNull()
    const bar = screen.getByTestId('explore-search-bar')
    const tabs = within(bar).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['List', 'Map'])
    fireEvent.click(within(bar).getByRole('tab', { name: 'Map' }))
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
    expect(screen.queryByTestId('card-grid')).toBeNull()
    expect(screen.queryByTestId('view-pill')).toBeNull()
  })

  it('stays side by side from 1440px, panel open or not', () => {
    renderAt(1440, { ownerPanelOpen: true })
    expect(screen.getByTestId('card-grid')).toBeInTheDocument()
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: /view/i })).toBeNull()
  })
})

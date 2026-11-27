// F059 criterion 5 (the PM, 2026-11-25) — Explore is a list at every width: no List | Map switch, no Map
// pill. A map appears only as an answer: today, a Page's map (#896). Widths go through a stubbed matchMedia.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BrowseSurface } from './BrowseSurface'
import { renderExplore, searchBox, openArea } from './explore-harness'
import type { BrowseSnapshot } from '@/app/explore/load'
import type { BrowseResult } from '@/lib/feed/browse-feed'

let params = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => params,
  usePathname: () => '/explore',
}))
const auth = { user: { id: 'm1', email: 'a@b.c' } as { id: string; email: string } | null, loading: false }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))
vi.mock('@/lib/member/own-pages', () => ({ getOwnPages: async () => [] }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/app/explore/actions', () => ({ browseFeedAction: vi.fn() }))
vi.mock('@/hooks/useScrollRestoration', () => ({ useScrollRestoration: () => {} }))
vi.mock('next/dynamic', () => ({
  default: () =>
    function MapStub({ results = [] }: { results?: { name: string }[] }) {
      return <div data-testid="browse-map" data-names={results.map((r) => r.name).join('|')} />
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
  } as BrowseResult
}

const SAC = { id: 'm1', slug: 'sacramento-roseville-ca', name: 'Sacramento-Roseville, CA', isOpen: true }
const snapshot: BrowseSnapshot = {
  results: Array.from({ length: 10 }, (_, i) => result(i)),
  following: [],
  map: [],
  area: null,
  metro: SAC,
  chosen: false,
  metros: [SAC],
  signedIn: false,
  failed: false,
  happening: { today: [], thisWeek: [], thisWeekend: [] },
}

// Layout tests describe a member's Explore (list and map); the signed-out
// ruling (F134, which replaced #334) has its own block below.
const renderAt = (w: number, props: { signedIn?: boolean } = {}) => {
  stubWidth(w)
  const { signedIn = true, ...rest } = props
  auth.user = signedIn ? { id: 'm1', email: 'a@b.c' } : null
  return renderExplore(<BrowseSurface initial={{ ...snapshot, signedIn }} {...rest} />, { create: true })
}

beforeEach(() => {
  stubWidth(390)
  params = new URLSearchParams()
})
afterEach(cleanup)

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

describe('the PM, 2026-11-01 — no bottom bar: the search is the header pill', () => {
  it('has no bottom bar and no floating dock', () => {
    renderAt(390)
    expect(screen.queryByTestId('mobile-bar')).toBeNull()
    expect(screen.queryByTestId('explore-dock')).toBeNull()
    expect(screen.queryByTestId('explore-search-bar')).toBeNull()
  })

  it('the pill writes the box the results read', () => {
    renderAt(390)
    fireEvent.change(searchBox(), { target: { value: 'rye' } })
    expect(screen.getByTestId('search-pill')).toHaveTextContent('rye')
  })

  it('Where opens the area picker', () => {
    renderAt(390)
    openArea()
    expect(screen.getByTestId('scope-sheet')).toBeInTheDocument()
  })

})

/** A Page's map (#896): the one question Explore answers with a map today. */
const PAGE_MAP = 'view=map&focus=k7x2m9&at=-121.47103,38.57271'

// [guards F059.5]
describe('F059.5 — a list at every width, and a map only as an answer', () => {
  for (const signedIn of [true, false]) {
    for (const w of [390, 744, 1024, 1280, 1440]) {
      it(`${signedIn ? 'a member' : 'a visitor'} at ${w}px sees the list, no map and nothing that opens one`, () => {
        renderAt(w, { signedIn })
        expect(screen.getByTestId('card-grid')).toBeInTheDocument()
        expect(screen.queryByTestId('browse-map')).toBeNull()
        expect(screen.queryByTestId('browse-map-pane')).toBeNull()
        expect(screen.queryByRole('link', { name: /on (the )?map/i })).toBeNull()
        expect(screen.queryByRole('button', { name: /(show|hide) (the )?map/i })).toBeNull()
        expect(screen.queryByRole('tablist')).toBeNull()
        if (signedIn) {
          fireEvent.click(screen.getByTestId('create-menu'))
          expect(screen.queryByRole('menuitem', { name: /map|list/i })).toBeNull()
        }
      })
    }
  }

  it('an old ?view=map link with no Page opens the list, not a map', () => {
    params = new URLSearchParams('view=map')
    renderAt(1280)
    expect(screen.getByTestId('card-grid')).toBeInTheDocument()
    expect(screen.queryByTestId('browse-map')).toBeNull()
  })

  it("a Page's map opens on that Page, with the way back", () => {
    params = new URLSearchParams(PAGE_MAP)
    renderAt(1280)
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
    expect(screen.queryByTestId('card-grid')).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to the Page' })).toHaveAttribute('href', '/g/k7x2m9')
  })

  // [guards F134.2 partial: a Page's map opens signed out, not sign-in; the pins it shows are guarded over the wire]
  it("signed out, a Page's map opens the map, not sign-in (F134)", () => {
    params = new URLSearchParams(PAGE_MAP)
    renderAt(390, { signedIn: false })
    expect(screen.queryByTestId('sign-in-prompt')).toBeNull()
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
  })
})

describe("#331 — a Page's map shows the tunable mix, narrowed by search and filters", () => {
  const mix = [{ ...result(1), name: 'Bread class', bucket: 'dated' as const }, { ...result(2), name: 'Pottery', bucket: 'new' as const }]
  it('the map gets the mix, not the list', () => {
    stubWidth(1280)
    params = new URLSearchParams(PAGE_MAP)
    renderExplore(<BrowseSurface initial={{ ...snapshot, signedIn: true, map: mix }} />)
    expect(screen.getByTestId('browse-map')).toHaveAttribute('data-names', 'Bread class|Pottery')
  })

  it('a search that empties the map offers to clear it', () => {
    stubWidth(1280)
    params = new URLSearchParams(`q=zzz-nothing&${PAGE_MAP}`)
    renderExplore(<BrowseSurface initial={{ ...snapshot, signedIn: true, map: mix }} />)
    expect(screen.getByTestId('browse-map')).toHaveAttribute('data-names', '')
    expect(screen.getByTestId('map-empty')).toHaveTextContent('Clear filters')
  })
})

describe('F134 — signed out, Explore lays out as signed in', () => {
  it('signed out there is no ➕ (the PM, 2026-11-01)', () => {
    renderAt(390, { signedIn: false })
    expect(screen.queryByTestId('create-menu')).toBeNull()
  })
})

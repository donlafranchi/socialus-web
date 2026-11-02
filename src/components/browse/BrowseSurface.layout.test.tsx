// T187 — Explore's list and map follow the screen width (F059 criterion 5,
// restated 2026-10-01). Widths are driven through a stubbed matchMedia.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BrowseSurface } from './BrowseSurface'
import { renderExplore, searchBox, openArea, switchView } from './explore-harness'
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
    withheld: false,
    announcementCount: null,
    announcementIds: null,
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
// ruling (#334) has its own block below.
const renderAt = (w: number, props: { ownerPanelOpen?: boolean; signedIn?: boolean } = {}) => {
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

describe('Don, 2026-11-01 — no bottom bar: the search is the header pill, List/Map is in the ➕', () => {
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

  it('Show on map is a small text link under the results, counted per day (plan #258)', () => {
    renderAt(390)
    const link = screen.getByTestId('show-on-map')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('data-map-tap', 'show_on_map')
    expect(screen.queryByTestId('browse-map')).toBeNull()
  })

  for (const w of [390, 744]) {
    it(`the ➕ swaps list and map at ${w}px`, () => {
      renderAt(w)
      fireEvent.click(screen.getByTestId('create-menu'))
      // plan #258 — Show the map is counted per day; Show the list is not.
      expect(screen.getByTestId('create-menu-view')).toHaveAttribute('data-map-tap', 'show_on_map')
      fireEvent.click(screen.getByTestId('create-menu'))
      switchView()
      expect(screen.getByTestId('browse-map')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('create-menu'))
      expect(screen.getByTestId('create-menu-view')).toHaveTextContent('Show the list')
    })
  }
})

// plan #230 — once the map is asked for (?view=map).
describe('T187 — 1024px and up, side by side', () => {
  beforeEach(() => {
    params = new URLSearchParams('view=map')
  })
  it('shows list and map together, with no toggle', () => {
    renderAt(1024)
    fireEvent.click(screen.getByTestId('create-menu'))
    expect(screen.queryByTestId('create-menu-view')).toBeNull()
    expect(screen.getByTestId('card-grid')).toBeInTheDocument()
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
    expect(screen.queryByTestId('view-pill')).toBeNull()
    expect(screen.queryByRole('tablist', { name: /view/i })).toBeNull()
  })

  it('collapses and restores the map from the handle on the divider', () => {
    renderAt(1440)
    const handle = screen.getByRole('button', { name: 'Hide map' })
    expect(handle).toHaveAttribute('aria-expanded', 'true')
    expect(handle).not.toHaveAttribute('data-map-tap')
    fireEvent.click(handle)
    // plan #258 — reopening it is a Show on map tap.
    expect(screen.getByRole('button', { name: 'Show map' })).toHaveAttribute('data-map-tap', 'show_on_map')
    expect(screen.queryByTestId('browse-map')).toBeNull()
    expect(screen.getByTestId('card-grid')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show map' }))
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
  })
})

describe('T187 — 1024–1439px with the owner panel open', () => {
  it('collapses the map and the ➕ offers the List/Map switch', () => {
    renderAt(1280, { ownerPanelOpen: true })
    expect(screen.queryByTestId('browse-map')).toBeNull()
    switchView()
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
    expect(screen.queryByTestId('card-grid')).toBeNull()
    expect(screen.queryByTestId('view-pill')).toBeNull()
  })

  it('stays side by side from 1440px, panel open or not', () => {
    params = new URLSearchParams('view=map')
    renderAt(1440, { ownerPanelOpen: true })
    expect(screen.getByTestId('card-grid')).toBeInTheDocument()
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: /view/i })).toBeNull()
  })
})

describe('#331 — the map shows the tunable mix, narrowed by search and filters', () => {
  const mix = [{ ...result(1), name: 'Bread class', bucket: 'dated' as const }, { ...result(2), name: 'Pottery', bucket: 'new' as const }]
  it('the map gets the mix, not the list', () => {
    stubWidth(1280)
    params = new URLSearchParams('view=map')
    renderExplore(<BrowseSurface initial={{ ...snapshot, signedIn: true, map: mix }} />)
    expect(screen.getByTestId('browse-map')).toHaveAttribute('data-names', 'Bread class|Pottery')
  })

  it('a search that empties the map offers to clear it', () => {
    stubWidth(1280)
    params = new URLSearchParams('q=zzz-nothing&view=map')
    renderExplore(<BrowseSurface initial={{ ...snapshot, signedIn: true, map: mix }} />)
    expect(screen.getByTestId('browse-map')).toHaveAttribute('data-names', '')
    expect(screen.getByTestId('map-empty')).toHaveTextContent('Clear filters')
  })
})

// #334 — ruling 2026-10-01: signed-out Explore is list only, and the Map pill
// opens sign-up. A signed-out visitor never gets the map, at any width.
describe('#334 — signed out: list only, Map opens sign-up', () => {
  for (const w of [390, 744, 1024, 1280, 1440]) {
    it(`shows the list and no map at ${w}px`, () => {
      renderAt(w, { signedIn: false })
      expect(screen.getByTestId('card-grid')).toBeInTheDocument()
      expect(screen.queryByTestId('browse-map')).toBeNull()
      expect(screen.queryByTestId('browse-map-pane')).toBeNull()
      expect(screen.queryByTestId('map-collapse-handle')).toBeNull()
    })
  }

  it('signed out there is no ➕, so no Map control (Don, 2026-11-01)', () => {
    renderAt(390, { signedIn: false })
    expect(screen.queryByTestId('create-menu')).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Map' })).toBeNull()
  })

  it('a member still gets the map beside the list at 1280, on request', () => {
    params = new URLSearchParams('view=map')
    renderAt(1280, { signedIn: true })
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
  })
})

// plan #230 (Don, 2026-10-31): "I also don't think the map helps here unless it's requested." Explore is a list;
// a quiet "Show on map" link opens the map, and ?view=map carries it (Yelp, Airbnb, Google Maps).
describe('plan #230 — the map on request', () => {
  afterEach(() => vi.restoreAllMocks())

  for (const w of [390, 1024, 1440]) {
    it(`shows the list and no map by default at ${w}px, with a Show on map link`, () => {
      renderAt(w)
      expect(screen.getByTestId('card-grid')).toBeInTheDocument()
      expect(screen.queryByTestId('browse-map')).toBeNull()
      const link = screen.getByRole('link', { name: 'Show on map' })
      expect(link.getAttribute('href')).toMatch(/view=map/)
      expect(link.className).not.toMatch(/rounded-full|border/)
    })
  }

  it('the link opens the map beside the list from 1024px, and writes ?view=map', () => {
    const replace = vi.spyOn(window.history, 'replaceState')
    renderAt(1280)
    fireEvent.click(screen.getByRole('link', { name: 'Show on map' }))
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
    expect(screen.getByTestId('card-grid')).toBeInTheDocument()
    expect(String(replace.mock.calls.at(-1)?.[2])).toMatch(/view=map/)
    expect(screen.queryByRole('link', { name: 'Show on map' })).toBeNull()
  })

  it('the link opens the map in place of the list on a phone', () => {
    renderAt(390)
    fireEvent.click(screen.getByRole('link', { name: 'Show on map' }))
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
    expect(screen.queryByTestId('card-grid')).toBeNull()
  })

  it('?view=map opens on the map', () => {
    params = new URLSearchParams('view=map')
    renderAt(1280)
    expect(screen.getByTestId('browse-map')).toBeInTheDocument()
  })

  it('signed out, the link opens sign-up instead of the map', () => {
    renderAt(1280, { signedIn: false })
    fireEvent.click(screen.getByRole('link', { name: 'Show on map' }))
    expect(screen.getByTestId('sign-in-prompt')).toBeInTheDocument()
    expect(screen.queryByTestId('browse-map')).toBeNull()
  })
})

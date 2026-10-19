// T156 — Browse renders Pages.
//
// The assertions that matter most here are the negative ones. A port that
// reintroduced the pill row, or that re-sorted the fetched page, or that
// shipped the whole result set to a signed-out reader and hid half of it,
// would look correct on screen and be wrong against F059.

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

const here = () => window.location.pathname + window.location.search

beforeEach(() => {
  search = ''
  window.history.replaceState(null, '', '/')
  replace.mockClear()
  browseFeedAction.mockReset()
})
afterEach(cleanup)

describe('T156 — Browse renders Pages, not Items', () => {
  it('renders a result card per Page', () => {
    render(<BrowseSurface initial={snapshot()} />)
    expect(screen.getByText('Sourdough Co')).toBeInTheDocument()
    // CardGrid owns its own testid — the grid is the card system's, not a
    // second one invented for this surface.
    expect(screen.getByTestId('card-grid')).toBeInTheDocument()
  })

  it('carries the name the people behind it are known by, on a post as well as a Page', () => {
    search = 'view=updates'
    const post = result({ resultKind: 'post', resultId: 'p1', body: 'rye is back Thursday' })
    render(<BrowseSurface initial={snapshot({ results: [post] })} />)
    expect(screen.getByText('Sourdough Co')).toBeInTheDocument()
    expect(screen.getByText('rye is back Thursday')).toBeInTheDocument()
  })

  it('shows an undated post without a date, not as a degraded event', () => {
    search = 'view=updates'
    const post = result({
      resultKind: 'post',
      resultId: 'p1',
      body: 'sourdough is back',
      startsAt: null,
      postedAt: '2026-09-02T18:00:00Z',
    })
    render(<BrowseSurface initial={snapshot({ results: [post] })} />)
    // #256: it keeps the date it was posted.
    expect(screen.getByTestId('browse-post-when')).toHaveTextContent('Posted Sep 2')
  })
})

describe('T156 — no filter pills, at any width', () => {
  it('renders no kind pill row on the results surface', () => {
    render(<BrowseSurface initial={snapshot()} />)
    for (const label of ['Events', 'Products', 'Services', 'Ideas', 'Offers', 'Asks', 'Initiatives']) {
      expect(screen.queryByRole('tab', { name: label })).not.toBeInTheDocument()
    }
  })

  it('renders no active-filter chip row', () => {
    render(<BrowseSurface initial={snapshot()} />)
    expect(screen.queryByTestId('active-filter-chips')).not.toBeInTheDocument()
  })

  it('keeps free-text search on the results surface — search is not a filter control', () => {
    render(<BrowseSurface initial={snapshot()} />)
    expect(screen.getByTestId('explore-search-bar')).toBeInTheDocument()
  })
})

describe('T156 — the results region', () => {
  it('is a labelled region, not a tabpanel, and names the active metro', () => {
    render(<BrowseSurface initial={snapshot()} />)
    const region = screen.getByTestId('browse-results')
    expect(region).toHaveAttribute('role', 'region')
    expect(region).toHaveAttribute('id', 'browse-results')
    expect(region).toHaveAccessibleName(/Sacramento-Roseville/)
  })

  it('the view pill points at it', () => {
    render(<BrowseSurface initial={snapshot()} />)
    fireEvent.click(screen.getByTestId('explore-dock-toggle'))
    expect(screen.getByTestId('view-pill')).toHaveAttribute('aria-controls', 'browse-results')
  })
})

describe('T156 — the signed-out visitor', () => {
  it('sees the banner and the full result set — no wall, no truncation', () => {
    const many = Array.from({ length: 9 }, (_, i) => result({ resultId: `r${i}`, name: `Page ${i}` }))
    render(<BrowseSurface initial={snapshot({ results: many })} />)
    expect(screen.getByTestId('result-count')).toHaveTextContent('9 results')
    expect(screen.getAllByTestId('tile-card')).toHaveLength(9)
  })

  it('a signed-in Member does not see the banner', () => {
    const { container } = render(<BrowseSurface initial={snapshot({ signedIn: true })} />)
    expect(container.textContent).not.toMatch(/Make this yours/i)
  })
})

describe('T156 — filtering preserves server order', () => {
  it('a search narrows without re-sorting', () => {
    const rows = [
      result({ resultId: 'a', name: 'Alpha bakery', tags: [] }),
      result({ resultId: 'b', name: 'Beta bakery', tags: [] }),
      result({ resultId: 'c', name: 'Gamma forge', tags: [] }),
    ]
    render(<BrowseSurface initial={snapshot({ results: rows })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'bakery' } })
    const titles = screen.getAllByTestId('tile-title').map((n) => n.textContent)
    expect(titles).toEqual(['Alpha bakery', 'Beta bakery'])
  })
})

describe('T156 — the empty and failed states are different things', () => {
  it('empty offers Clear filters, with a wider area beneath it', () => {
    render(<BrowseSurface initial={snapshot({ results: [] })} />)
    expect(screen.getByTestId('browse-empty')).toHaveTextContent('Nothing here yet — try another filter')
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
    expect(screen.getByTestId('browse-widen')).toBeInTheDocument()
  })

  it('a failed read says so rather than inviting someone to clear filters that were never the problem', () => {
    render(<BrowseSurface initial={snapshot({ results: [], failed: true })} />)
    expect(screen.getByTestId('browse-error')).toBeInTheDocument()
    expect(screen.queryByTestId('browse-empty')).not.toBeInTheDocument()
  })

  it('no resolvable scope suppresses the controls', () => {
    render(<BrowseSurface initial={snapshot({ metro: null, results: [] })} />)
    expect(screen.getByTestId('feed-no-place')).toBeInTheDocument()
    expect(screen.queryByTestId('explore-search-bar')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })
})

describe('T156 — switching metro', () => {
  it('refetches through the server action and keeps the previous page until it resolves', async () => {
    let release: (v: BrowseSnapshot) => void = () => {}
    browseFeedAction.mockReturnValue(new Promise<BrowseSnapshot>((r) => (release = r)))

    render(<BrowseSurface initial={snapshot()} />)
    fireEvent.click(screen.getByTestId('explore-location-pill'))
    fireEvent.click(await screen.findByTestId('scope-metro-portland-vancouver-or-wa'))

    await waitFor(() => expect(browseFeedAction).toHaveBeenCalledWith('portland-vancouver-or-wa'))
    // Still the old page, because the new one has not landed.
    expect(screen.getByText('Sourdough Co')).toBeInTheDocument()

    release(snapshot({ metro: PDX, chosen: true, results: [result({ resultId: 'r9', name: 'Stumptown Co' })] }))
    await screen.findByText('Stumptown Co')
    expect(screen.getByTestId('browse-results')).toHaveAccessibleName(/Portland/)
  })

  it('a slow earlier response never overwrites a newer one', async () => {
    let releaseFirst: (v: BrowseSnapshot) => void = () => {}
    browseFeedAction
      .mockReturnValueOnce(new Promise<BrowseSnapshot>((r) => (releaseFirst = r)))
      .mockResolvedValueOnce(snapshot({ metro: SAC, chosen: true, results: [result({ resultId: 'r8', name: 'Second answer' })] }))

    render(<BrowseSurface initial={snapshot()} />)
    fireEvent.click(screen.getByTestId('explore-location-pill'))
    fireEvent.click(await screen.findByTestId('scope-metro-portland-vancouver-or-wa'))
    fireEvent.click(screen.getByTestId('explore-location-pill'))
    fireEvent.click(await screen.findByTestId('scope-metro-sacramento-roseville-ca'))

    await screen.findByText('Second answer')
    releaseFirst(snapshot({ metro: PDX, chosen: true, results: [result({ resultId: 'r7', name: 'Stale answer' })] }))
    await waitFor(() => expect(screen.queryByText('Stale answer')).not.toBeInTheDocument())
    expect(screen.getByText('Second answer')).toBeInTheDocument()
  })

  it('offers the metros resolved on the server, not a list it fetched itself', async () => {
    render(<BrowseSurface initial={snapshot()} />)
    fireEvent.click(screen.getByTestId('explore-location-pill'))
    const sheet = await screen.findByTestId('scope-sheet')
    expect(within(sheet).getByTestId('scope-metro-portland-vancouver-or-wa')).toBeInTheDocument()
  })
})

describe('T156 — a shared link reopens the same metro and search', () => {
  it('writes the chosen metro and the search into the URL', async () => {
    render(<BrowseSurface initial={snapshot({ chosen: true })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'sourdough' } })
    await waitFor(() => expect(here()).toBe('/explore?metro=sacramento-roseville-ca&q=sourdough'))
  })

  it('leaves an unchosen metro out of the URL — nobody picked it', async () => {
    render(<BrowseSurface initial={snapshot({ chosen: false })} />)
    await waitFor(() => expect(here()).toBe('/explore'))
  })
})

describe('T156 — M3: the accent token is not used for text on white', () => {
  // Written when `--color-accent` was #0fab8e (2.9:1 on white). Navy (#325)
  // passes, but these quiet controls stay charcoal so the accent marks actions.
  it('the empty state\u2019s controls are charcoal or muted, never accent', () => {
    render(<BrowseSurface initial={snapshot({ results: [] })} />)
    const clear = screen.getByRole('button', { name: /clear filters/i })
    expect(clear.className).toContain('text-[var(--color-charcoal-900)]')
    expect(clear.className).not.toContain('text-[var(--color-accent)]')
    expect(screen.getByTestId('browse-widen').className).not.toContain('text-[var(--color-accent)]')
  })

  it('the no-scope control is charcoal', () => {
    render(<BrowseSurface initial={snapshot({ metro: null, results: [] })} />)
    const choose = screen.getByRole('button', { name: /choose your area/i })
    expect(choose.className).toContain('text-[var(--color-charcoal-900)]')
  })

  it('every text control carries a full-height touch target', () => {
    render(<BrowseSurface initial={snapshot({ results: [] })} />)
    expect(screen.getByRole('button', { name: /clear filters/i }).className).toMatch(/min-h-11/)
    expect(screen.getByTestId('browse-widen').className).toMatch(/min-h-11/)
  })
})

describe('T169 — F059 criterion 2b, the personal half on the surface', () => {
  it('renders no trace of the row for a signed-out reader', () => {
    render(<BrowseSurface initial={snapshot({ signedIn: false, following: [] })} />)
    expect(screen.queryByTestId('browse-following')).not.toBeInTheDocument()
    // Absence, not emptiness. No heading, no hint the row exists.
    expect(screen.queryByText(/announcements from pages/i)).not.toBeInTheDocument()
  })

  it('renders no row for a member who follows nothing', () => {
    render(<BrowseSurface initial={snapshot({ signedIn: true, following: [] })} />)
    expect(screen.queryByTestId('browse-following')).not.toBeInTheDocument()
  })

  // #876 (Don, 2026-10-16) — no separate row: the loader mixes the followed Pages' updates into the results.
  it('shows a followed Page’s update in the mixed list, not in a row of its own', () => {
    const mine = result({ resultKind: 'post', resultId: 'p-9', name: 'Pond Side Circle', followed: true })
    render(<BrowseSurface initial={snapshot({ signedIn: true, results: [result(), mine], following: [mine] })} />)
    expect(screen.queryByTestId('browse-following')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('browse-list-pane')).getByText('Pond Side Circle')).toBeInTheDocument()
  })

  it('keeps the personal half out of the result count', () => {
    const mine = result({ resultKind: 'post', resultId: 'p-9', name: 'Pond Side Circle' })
    render(<BrowseSurface initial={snapshot({ signedIn: true, following: [mine] })} />)
    // One public result. The row is not a result of the search and must not
    // inflate the count above the grid.
    expect(screen.getByTestId('result-count').textContent).toMatch(/^1 result/)
  })

})

// #476 — a neighbourhood narrows Explore to that place.
describe('#476 — picking a neighbourhood', () => {
  const MIDTOWN = { id: 'p-1', name: 'Midtown' }

  it('asks for that place, in the current metro', async () => {
    browseFeedAction.mockResolvedValue(snapshot({ area: MIDTOWN, chosen: true }))
    render(<BrowseSurface initial={snapshot()} />)
    fireEvent.click(screen.getByTestId('explore-location-pill'))
    fireEvent.change(screen.getByTestId('scope-search'), { target: { value: 'mid' } })
    fireEvent.click(await screen.findByTestId('scope-area-p-1'))
    await waitFor(() => expect(browseFeedAction).toHaveBeenCalledWith('sacramento-roseville-ca', 'p-1'))
  })

  it('names the neighbourhood on the pill and keeps it in the link', async () => {
    render(<BrowseSurface initial={snapshot({ area: MIDTOWN })} />)
    expect(screen.getByTestId('explore-location-pill')).toHaveTextContent('Midtown')
    await waitFor(() => expect(here()).toContain('area=p-1'))
  })

  it('"All of" the metro clears it', async () => {
    browseFeedAction.mockResolvedValue(snapshot())
    render(<BrowseSurface initial={snapshot({ area: MIDTOWN })} />)
    fireEvent.click(screen.getByTestId('explore-location-pill'))
    fireEvent.click(screen.getByTestId('scope-area-clear'))
    await waitFor(() => expect(browseFeedAction).toHaveBeenCalledWith('sacramento-roseville-ca', null))
  })
})

describe('#549 — the pins come after the list', () => {
  beforeEach(() => browseMapAction.mockReset().mockResolvedValue([]))

  it('a member with no pins yet asks for them, for the metro on screen', async () => {
    render(<BrowseSurface initial={snapshot({ signedIn: true, metro: SAC })} />)
    await waitFor(() => expect(browseMapAction).toHaveBeenCalledWith(SAC.id, null))
  })

  it('a signed-out visitor never asks: there are no pins there', async () => {
    render(<BrowseSurface initial={snapshot({ signedIn: false, metro: SAC })} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(browseMapAction).not.toHaveBeenCalled()
  })
})

// #619 / #621 (F092.2, F092.4) — the sheet writes plain words into the box, and the box is the state.
describe('F092 — the filter sheet writes its selection into the search box', () => {
  const coffee = result({ resultId: 'c1', name: 'Bean Co', tags: ['Food & drink'], description: 'Roasters', startsAt: null })
  const bread = result({ resultId: 'b1', name: 'Rye Co', tags: ['Live music'], description: 'Bakers' })
  const openSheet = () => fireEvent.click(screen.getByTestId('explore-filter-icon'))
  const box = () => screen.getByTestId('search-input') as HTMLInputElement
  const openBox = () => fireEvent.click(screen.getByRole('button', { name: 'Search' }))

  // [guards F092.2]
  it('applying dismisses the sheet and writes the selection as plain words, no hashtag', async () => {
    render(<BrowseSurface initial={snapshot({ results: [coffee, bread] })} />)
    openSheet()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Food & drink' }))
    fireEvent.click(screen.getByRole('radio', { name: 'This weekend' }))
    fireEvent.click(screen.getByRole('button', { name: /show results/i }))
    await waitFor(() => expect(box().value).toBe('food & drink this weekend'))
    expect(box().value).not.toContain('#')
    expect(screen.queryByTestId('explore-filter-sheet')).toBeNull()
  })

  it('keeps what was already typed in front of what the sheet writes', async () => {
    render(<BrowseSurface initial={snapshot({ results: [coffee, bread] })} />)
    openBox()
    fireEvent.change(box(), { target: { value: 'roasters' } })
    openSheet()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Food & drink' }))
    fireEvent.click(screen.getByRole('button', { name: /show results/i }))
    await waitFor(() => expect(box().value).toBe('roasters food & drink'))
    expect(screen.getByText('Bean Co')).toBeInTheDocument()
    expect(screen.queryByText('Rye Co')).toBeNull()
  })

  // [guards F092.4 partial: what the sheet wrote is read as the same selection, so it narrows]
  it('the words it wrote narrow the results the way the selection did', async () => {
    render(<BrowseSurface initial={snapshot({ results: [coffee, bread] })} />)
    openSheet()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Live music' }))
    fireEvent.click(screen.getByRole('button', { name: /show results/i }))
    await waitFor(() => expect(box().value).toBe('live music'))
    expect(screen.getByText('Rye Co')).toBeInTheDocument()
    expect(screen.queryByText('Bean Co')).toBeNull()
  })

  it('typing the same words by hand does the same, and reopening the sheet shows them checked', async () => {
    render(<BrowseSurface initial={snapshot({ results: [coffee, bread] })} />)
    openBox()
    fireEvent.change(box(), { target: { value: 'Food & Drink' } })
    expect(screen.getByText('Bean Co')).toBeInTheDocument()
    expect(screen.queryByText('Rye Co')).toBeNull()
    openSheet()
    expect(screen.getByRole('checkbox', { name: 'Food & drink' })).toBeChecked()
  })

  it('clearing the box clears the narrowing', async () => {
    render(<BrowseSurface initial={snapshot({ results: [coffee, bread] })} />)
    openBox()
    fireEvent.change(box(), { target: { value: 'food & drink' } })
    expect(screen.queryByText('Rye Co')).toBeNull()
    fireEvent.change(box(), { target: { value: '' } })
    expect(screen.getByText('Rye Co')).toBeInTheDocument()
  })

  it('Clear all in the sheet takes its words out of the box and keeps the free ones', async () => {
    render(<BrowseSurface initial={snapshot({ results: [coffee, bread] })} />)
    openBox()
    fireEvent.change(box(), { target: { value: 'roasters food & drink this week' } })
    openSheet()
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }))
    await waitFor(() => expect(box().value).toBe('roasters'))
  })

  it('the URL carries the words, not separate filter parameters', async () => {
    render(<BrowseSurface initial={snapshot({ results: [coffee, bread] })} />)
    openBox()
    fireEvent.change(box(), { target: { value: 'food & drink this weekend' } })
    await waitFor(() => expect(here()).toBe('/explore?q=food+%26+drink+this+weekend'))
  })
})

describe('#791 — the list renders a step at a time', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('draws one step of cards, not all of them, while the count still says how many', async () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return []
        }
      },
    )
    const many = Array.from({ length: 60 }, (_, i) => result({ resultId: `r${i}`, groupId: `g${i}`, slug: `p${i}`, name: `Page ${i}`, href: `/g/p${i}` }))
    render(<BrowseSurface initial={snapshot({ results: many })} />)
    expect(screen.getByTestId('result-count')).toHaveTextContent('60 results')
    await waitFor(() => expect(within(screen.getByTestId('card-grid')).getAllByRole('link')).toHaveLength(24))
    expect(screen.getByTestId('browse-more')).toBeInTheDocument()
  })
})

// #916 (Don, 2026-10-18: "I did a search for flowers (plural) and it didn't return anything but flower
// (singular) did.") — the box asks the server, which searches the whole market, not the rows in hand.
describe('#916 — search asks the server', () => {
  it('a Page outside the rows in hand comes back from the server, once the typing settles', async () => {
    browseFeedAction.mockResolvedValue(snapshot({ results: [result({ resultId: 'z1', name: 'Zinnia Flower Farm' })] }))
    render(<BrowseSurface initial={snapshot()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'flowers' } })
    expect(browseFeedAction).not.toHaveBeenCalled()
    await waitFor(() => expect(browseFeedAction).toHaveBeenCalledWith(null, null, null, 'flowers', null))
    expect(await screen.findByText('Zinnia Flower Farm')).toBeInTheDocument()
    expect(browseFeedAction).toHaveBeenCalledTimes(1)
  })

  it('nothing found says so, and suggests what to try', async () => {
    browseFeedAction.mockResolvedValue(snapshot({ results: [] }))
    render(<BrowseSurface initial={snapshot()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'qqqzzz' } })
    await waitFor(() => expect(screen.getByTestId('browse-empty')).toHaveTextContent('Nothing matches “qqqzzz” yet. Try fewer words, or a broader one like “food” or “plants”.'))
  })
})

// #935 — typing a search re-rendered the whole Explore page on the server once per keystroke (router.replace),
// each render several feed reads; signed in, that flood held a tapped result and the Page it opened.
describe('#935 — a search keeps the link in the address bar without asking the server for the page', () => {
  it('typing writes the words into the URL in place, and never re-renders Explore on the server', async () => {
    browseFeedAction.mockResolvedValue(snapshot({ results: [] }))
    render(<BrowseSurface initial={snapshot({ chosen: true })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    for (const value of ['s', 'sa', 'sac', 'sacr']) fireEvent.change(screen.getByTestId('search-input'), { target: { value } })
    await waitFor(() => expect(here()).toBe('/explore?metro=sacramento-roseville-ca&q=sacr'))
    expect(replace).not.toHaveBeenCalled()
  })

  it('a Page or post found by search is a link to an address the Page route resolves', async () => {
    browseMapAction.mockResolvedValue([])
    browseFeedAction.mockResolvedValue(
      snapshot({
        results: [
          result({ resultId: 'g-own', groupId: 'g-own', name: 'SacRiver Floaters', href: '/g/3k8x0p' }),
          result({ resultKind: 'post', resultId: 'p-1', groupId: 'g-own', name: 'SacRiver Floaters', body: 'Float Saturday', href: '/g/3k8x0p#announcement-p-1' }),
        ],
      }),
    )
    render(<BrowseSurface initial={snapshot({ signedIn: true })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'sacriver' } })
    const links = await screen.findAllByRole('link', { name: /SacRiver Floaters/ })
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/g/3k8x0p', '/g/3k8x0p#announcement-p-1'])
  })
})

// #896 — opened from a Page's map: Explore opens on the map, with a way back to the Page.
describe("#896 — Explore's map, opened from a Page", () => {
  afterEach(() => {
    search = ''
  })
  it('opens on the map with a link back to the Page', () => {
    search = 'view=map&focus=vino12&at=-120.75284,38.40055'
    render(<BrowseSurface initial={snapshot({ signedIn: true })} />)
    expect(screen.getByTestId('browse-map-pane')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to the page/i })).toHaveAttribute('href', '/g/vino12')
  })
  it('an ordinary visit still opens on the list, with no way back to show', () => {
    render(<BrowseSurface initial={snapshot({ signedIn: true })} />)
    expect(screen.queryByTestId('browse-map-pane')).toBeNull()
    expect(screen.queryByRole('link', { name: /back to the page/i })).toBeNull()
  })
})

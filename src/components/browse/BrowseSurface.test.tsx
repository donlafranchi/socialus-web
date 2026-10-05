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
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}))

const browseFeedAction = vi.fn()
vi.mock('@/app/explore/actions', () => ({
  browseFeedAction: (slug: string | null) => browseFeedAction(slug),
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
    metro: SAC,
    chosen: false,
    metros: [SAC, PDX],
    signedIn: false,
    failed: false,
    ...over,
  }
}

beforeEach(() => {
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
    const post = result({ resultKind: 'post', resultId: 'p1', body: 'rye is back Thursday' })
    render(<BrowseSurface initial={snapshot({ results: [post] })} />)
    expect(screen.getByText('Sourdough Co')).toBeInTheDocument()
    expect(screen.getByText('rye is back Thursday')).toBeInTheDocument()
  })

  it('shows an undated post without a date, not as a degraded event', () => {
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
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        '/explore?metro=sacramento-roseville-ca&q=sourdough',
        { scroll: false },
      ),
    )
  })

  it('leaves an unchosen metro out of the URL — nobody picked it', async () => {
    render(<BrowseSurface initial={snapshot({ chosen: false })} />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/explore', { scroll: false }))
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

  it('renders the row when there is something in it', () => {
    const mine = result({ resultKind: 'post', resultId: 'p-9', name: 'Pond Side Circle' })
    render(<BrowseSurface initial={snapshot({ signedIn: true, following: [mine] })} />)
    expect(screen.getByTestId('browse-following')).toBeInTheDocument()
  })

  it('keeps the personal half out of the result count', () => {
    const mine = result({ resultKind: 'post', resultId: 'p-9', name: 'Pond Side Circle' })
    render(<BrowseSurface initial={snapshot({ signedIn: true, following: [mine] })} />)
    // One public result. The row is not a result of the search and must not
    // inflate the count above the grid.
    expect(screen.getByTestId('result-count').textContent).toMatch(/^1 result/)
  })

  it('does not let a search over the public half filter the personal row', () => {
    const mine = result({ resultKind: 'post', resultId: 'p-9', name: 'Pond Side Circle' })
    render(<BrowseSurface initial={snapshot({ signedIn: true, following: [mine] })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'zzzzz' } })
    // The public half is now empty…
    expect(screen.getByTestId('browse-empty')).toBeInTheDocument()
    expect(screen.getByTestId('browse-following')).toBeInTheDocument()
  })
})

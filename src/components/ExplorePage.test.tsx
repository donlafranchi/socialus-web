// T117 — Explore reads the items MV and the kind pills filter it end-to-end.
// T115 — the sticky search row, the secondary-filter sheet, and the chip row.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const replace = vi.fn()
let searchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => searchParams,
}))

// The map is dynamically imported and needs a real GL context; the list view is
// what this suite exercises.
vi.mock('next/dynamic', () => ({
  default: () => function StubMap({ items }: { items: unknown[] }) {
    return <div data-testid="explore-map" data-item-count={items.length} />
  },
}))

const GOOD_MARKET = '0101000020E6100000C3F5285C8F7A5EC0713D0AD7A3A04340'
// POINT(-121.915 39.255) — the locality centroid; the same point the seeded
// market sits on, so the near items are inside every radius and SF is outside.
const PLACE_CENTROID = '0101000020E6100000C3F5285C8F7A5EC0713D0AD7A3A04340'
// POINT(-122.42 37.77) — San Francisco, ~75 mi out.
const FAR_AWAY = '0101000020E61000007B14AE47E19A5EC0C3F5285C8FE24240'

function mvRow(over: Record<string, unknown> = {}) {
  return {
    item_id: 'a0000001-0000-4000-8000-000000000001',
    member_handle: 'maya-okonkwo',
    member_display_name: 'Maya Okonkwo',
    item_kind: 'product',
    title: 'Country Sourdough Loaf',
    description: 'Naturally leavened.',
    category: 'food',
    brand_label: 'The Good Loaf',
    group_id: null,
    nearest_location_label: 'The Good Market',
    nearest_location_geography: GOOD_MARKET,
    response_count: 3,
    primary_tag: 'bread',
    photo_url: null,
    starts_at: null,
    published_at: '2026-07-26T14:33:36.769471+00:00',
    ...over,
  }
}

const ROWS = [
  mvRow(),
  mvRow({ item_id: 'i2', title: 'Seeded Rye Loaf' }),
  mvRow({ item_id: 'i3', item_kind: 'gathering', title: 'Repair Cafe', category: 'repair', brand_label: null, member_handle: 'rosa-delgado', member_display_name: 'Rosa Delgado' }),
  mvRow({ item_id: 'i4', item_kind: 'service', title: 'Saturday Bike Tune-Up', category: 'repair', brand_label: null, member_handle: 'theo-brandt', member_display_name: 'Theo Brandt' }),
  mvRow({ item_id: 'i5', title: 'Bay Area Beeswax', category: 'crafts', nearest_location_geography: FAR_AWAY }),
]

const PLACE = { id: 'wsac', display_name: 'West Sacramento', slug: 'the-good-place', kind: 'city' }

/** Records the `.eq()` predicates each MV fetch sent, and answers from ROWS. */
const eqCalls: [string, unknown][][] = []

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    from: (table: string) => {
      const applied: [string, unknown][] = []
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.is = () => b
      b.not = () => b
      b.eq = (c: string, v: unknown) => { applied.push([c, v]); return b }
      b.order = () => b
      b.maybeSingle = async () =>
        table === 'places' ? { data: { centroid: PLACE_CENTROID }, error: null } : { data: null, error: null }
      // Thenable — the places-by-slug and item_gatherings reads await the builder.
      b.then = (resolve: (v: unknown) => void) =>
        resolve({
          data: table === 'places' ? [PLACE] : table === 'item_gatherings' ? [{ item_id: 'i3' }] : [],
          error: null,
        })
      b.limit = () => {
        eqCalls.push(applied)
        const kind = applied.find(([c]) => c === 'item_kind')?.[1]
        const data = kind ? ROWS.filter((r) => r.item_kind === kind) : ROWS
        return Promise.resolve({ data, error: null })
      }
      return b
    },
  }),
}))

import { ExplorePage } from './ExplorePage'
import { NavVisibilityContext } from './NavVisibilityProvider'

function renderExplore() {
  return render(
    <NavVisibilityContext.Provider value={true}>
      <ExplorePage />
    </NavVisibilityContext.Provider>,
  )
}

const cards = () => screen.queryAllByTestId('feed-item-card')
const titles = () => cards().map((c) => within(c).getByRole('heading').textContent)
const openSearch = () => fireEvent.click(screen.getByRole('button', { name: 'Search' }))
const openSheet = () => fireEvent.click(screen.getByRole('button', { name: /open filters/i }))
const sheet = () => screen.getByRole('dialog')
const showResults = () => fireEvent.click(within(sheet()).getByRole('button', { name: /show results/i }))

beforeEach(() => {
  eqCalls.length = 0
  replace.mockClear()
  searchParams = new URLSearchParams()
  sessionStorage.clear()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('T117 — Explore is items-backed', () => {
  it('renders a card per published item from the MV', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(screen.getByText('Country Sourdough Loaf')).toBeInTheDocument()
    expect(screen.getByText('Repair Cafe')).toBeInTheDocument()
  })

  it('links each card to the canonical member-scoped item URL', async () => {
    renderExplore()
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    expect(cards()[0]).toHaveAttribute('href', '/m/maya-okonkwo/p/country-sourdough-loaf-a0000001')
  })

  it('counts results in items, not vendors', async () => {
    renderExplore()
    await waitFor(() => expect(screen.getByTestId('result-count')).toHaveTextContent('5 items'))
  })

  it('does not query the retired vendor tables', async () => {
    renderExplore()
    await waitFor(() => expect(eqCalls.length).toBeGreaterThan(0))
    expect(eqCalls.flat().map(([c]) => c)).not.toContain('vendor_id')
  })
})

describe('T117 — the kind pills filter the item results', () => {
  it('starts on All with no kind predicate and every item shown', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(eqCalls[0]).toEqual([])
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('filters to gatherings when Events is tapped', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    fireEvent.click(screen.getByRole('tab', { name: 'Events' }))
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(screen.getByText('Repair Cafe')).toBeInTheDocument()
    expect(eqCalls.at(-1)).toEqual([['item_kind', 'gathering']])
  })

  it('restores the selection from ?kind= on load and fetches that kind', async () => {
    searchParams = new URLSearchParams('kind=service')
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(screen.getByText('Saturday Bike Tune-Up')).toBeInTheDocument()
    expect(eqCalls[0]).toEqual([['item_kind', 'service']])
  })

  it('writes the selection back to the URL', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    fireEvent.click(screen.getByRole('tab', { name: 'Ideas' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/explore?kind=wonder', { scroll: false }))
  })

  it('keeps the previous results on screen while the next kind loads', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    fireEvent.click(screen.getByRole('tab', { name: 'Events' }))
    expect(cards().length).toBe(5)
    expect(screen.getByTestId('result-count')).not.toHaveTextContent('Loading')
  })
})

describe('T115 — the sticky search row replaces the filter-button row', () => {
  it('carries the locality, a search affordance and a filter affordance', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(screen.getByTestId('explore-search-bar')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('explore-location-pill')).toHaveTextContent('West Sacramento'))
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open filters/i })).toBeInTheDocument()
  })

  it('shows no standalone market, category or day filter buttons anywhere', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(screen.queryByRole('button', { name: /^category$/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('market-pill')).not.toBeInTheDocument()
    expect(screen.queryByTestId('search-input-desktop')).not.toBeInTheDocument()
  })

  it('narrows results by search across item fields', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    openSearch()
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'rye' } })
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(screen.getByText('Seeded Rye Loaf')).toBeInTheDocument()
  })

  it('offers Clear filters when a search matches nothing', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    openSearch()
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'zzzz' } })
    await waitFor(() => expect(cards()).toHaveLength(0))
    const empty = screen.getByTestId('explore-empty')
    fireEvent.click(within(empty).getByRole('button', { name: /clear filters/i }))
    await waitFor(() => expect(cards()).toHaveLength(5))
  })
})

describe('T115 — the bottom sheet applies the secondary filters', () => {
  it('opens on the filter icon and closes on Show results', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    openSheet()
    expect(sheet()).toBeInTheDocument()
    showResults()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers the categories present in the results', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    openSheet()
    expect(within(sheet()).getByRole('checkbox', { name: 'Food' })).toBeInTheDocument()
    expect(within(sheet()).getByRole('checkbox', { name: 'Repair' })).toBeInTheDocument()
    expect(within(sheet()).getByRole('checkbox', { name: 'Crafts' })).toBeInTheDocument()
  })

  it('narrows the results when a category is applied', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    openSheet()
    fireEvent.click(within(sheet()).getByRole('checkbox', { name: 'Repair' }))
    showResults()
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(titles()).toEqual(['Repair Cafe', 'Saturday Bike Tune-Up'])
  })

  it('drops results outside the chosen radius', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    openSheet()
    fireEvent.click(within(sheet()).getByRole('radio', { name: '25 mi' }))
    showResults()
    await waitFor(() => expect(cards()).toHaveLength(4))
    expect(titles()).not.toContain('Bay Area Beeswax')
  })

  it('narrows to the gatherings that recur', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    openSheet()
    fireEvent.click(within(sheet()).getByRole('radio', { name: 'Recurring' }))
    showResults()
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(titles()).toEqual(['Repair Cafe'])
  })

  it('reorders the results when a sort is applied', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    openSheet()
    fireEvent.click(within(sheet()).getByRole('radio', { name: 'Nearest' }))
    showResults()
    await waitFor(() => expect(titles().at(-1)).toBe('Bay Area Beeswax'))
  })
})

describe('T115 — the chip row', () => {
  it('is absent until a secondary filter is set', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(screen.queryByTestId('explore-filter-chips')).not.toBeInTheDocument()
  })

  it('renders a chip for each applied secondary filter', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    openSheet()
    fireEvent.click(within(sheet()).getByRole('radio', { name: '25 mi' }))
    fireEvent.click(within(sheet()).getByRole('checkbox', { name: 'Repair' }))
    showResults()
    await waitFor(() => expect(screen.getAllByTestId('explore-filter-chip')).toHaveLength(2))
    expect(screen.getByText('Within 25 mi')).toBeInTheDocument()
    expect(screen.getByText('Repair')).toBeInTheDocument()
  })

  it('never renders a chip for the kind selection', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    fireEvent.click(screen.getByRole('tab', { name: 'Events' }))
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(screen.queryByTestId('explore-filter-chips')).not.toBeInTheDocument()
  })

  it('removes one filter and restores those results when a chip is dismissed', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    openSheet()
    fireEvent.click(within(sheet()).getByRole('checkbox', { name: 'Repair' }))
    showResults()
    await waitFor(() => expect(cards()).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Repair filter' }))
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(screen.queryByTestId('explore-filter-chips')).not.toBeInTheDocument()
  })

  it('disappears entirely when Clear all is tapped in the sheet', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    openSheet()
    fireEvent.click(within(sheet()).getByRole('radio', { name: '25 mi' }))
    showResults()
    await waitFor(() => expect(screen.getByTestId('explore-filter-chips')).toBeInTheDocument())
    openSheet()
    fireEvent.click(within(sheet()).getByRole('button', { name: /clear all/i }))
    await waitFor(() => expect(screen.queryByTestId('explore-filter-chips')).not.toBeInTheDocument())
  })
})

describe('T115 — the dot indicator', () => {
  it('is absent by default and present once a secondary filter is applied', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(screen.queryByTestId('filter-active-dot')).not.toBeInTheDocument()
    openSheet()
    fireEvent.click(within(sheet()).getByRole('radio', { name: 'This week' }))
    showResults()
    await waitFor(() => expect(screen.getByTestId('filter-active-dot')).toBeInTheDocument())
  })

  it('stays absent for a kind selection — that state lives on the pills', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    fireEvent.click(screen.getByRole('tab', { name: 'Events' }))
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(screen.queryByTestId('filter-active-dot')).not.toBeInTheDocument()
  })
})

describe('T115 — filter state round-trips through the URL', () => {
  it('writes every applied filter into the query string', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    openSheet()
    fireEvent.click(within(sheet()).getByRole('radio', { name: '25 mi' }))
    fireEvent.click(within(sheet()).getByRole('radio', { name: 'Nearest' }))
    showResults()
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/explore?distance=25&sort=nearest', { scroll: false }),
    )
  })

  it('restores kind and every secondary filter from a shared link', async () => {
    searchParams = new URLSearchParams('kind=gathering&category=repair&schedule=recurring&distance=25')
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(titles()).toEqual(['Repair Cafe'])
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByTestId('explore-filter-chip')).toHaveLength(3)
    expect(screen.getByTestId('filter-active-dot')).toBeInTheDocument()
  })

  it('opens the sheet already reflecting the restored state', async () => {
    searchParams = new URLSearchParams('distance=10&sort=responses')
    renderExplore()
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    openSheet()
    expect(within(sheet()).getByRole('radio', { name: '10 mi' })).toBeChecked()
    expect(within(sheet()).getByRole('radio', { name: 'Most responses' })).toBeChecked()
  })

  it('ignores a filter the URL invented rather than emptying the surface', async () => {
    searchParams = new URLSearchParams('distance=999&schedule=someday&sort=cheapest')
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(screen.queryByTestId('explore-filter-chips')).not.toBeInTheDocument()
  })
})

describe('T115 — back navigation restores the scroll position', () => {
  it('jumps back to the recorded offset once the results have painted', async () => {
    sessionStorage.setItem('scroll:explore', '640')
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'instant' }))
  })

  it('does not scroll when there is nothing recorded', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(window.scrollTo).not.toHaveBeenCalled()
  })
})

describe('T117 — the read degrades instead of stranding the tab', () => {
  it('falls through to the empty state when the MV read rejects', async () => {
    const ssr = await import('@supabase/ssr')
    const spy = vi.spyOn(ssr, 'createBrowserClient').mockReturnValue({
      from: () => ({
        select: () => ({
          not: () => Promise.resolve({ data: [], error: null }),
          is: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          order: () => ({ limit: () => Promise.reject(new Error('offline')) }),
        }),
      }),
    } as never)
    renderExplore()
    await waitFor(() => expect(screen.getByTestId('explore-empty')).toBeInTheDocument())
    expect(screen.getByTestId('result-count')).not.toHaveTextContent('Loading')
    spy.mockRestore()
  })

  it('keeps the surface usable when the locality never resolves', async () => {
    const ssr = await import('@supabase/ssr')
    const spy = vi.spyOn(ssr, 'createBrowserClient').mockReturnValue({
      from: (table: string) => {
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.is = () => b
        b.not = () => b
        b.eq = () => b
        b.order = () => b
        b.maybeSingle = async () => ({ data: null, error: null })
        b.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
        b.limit = () => Promise.resolve({ data: table === 'discoverable_items' ? ROWS : [], error: null })
        return b
      },
    } as never)
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(screen.getByTestId('explore-location-pill')).toHaveTextContent('Nearby')
    openSheet()
    expect(within(sheet()).getByRole('radio', { name: '5 mi' })).toBeDisabled()
    spy.mockRestore()
  })
})

describe('T116 — the List/Map toggle is inline in the results', () => {
  const toggle = () => screen.getByTestId('list-map-toggle')

  it('no longer renders a fixed control cluster', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(screen.queryByTestId('bottom-controls')).not.toBeInTheDocument()
  })

  it('sits inside the results region, in the document flow', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(document.getElementById('explore-results')!.contains(toggle())).toBe(true)
    expect(toggle().className).not.toMatch(/\bfixed\b/)
  })

  it('falls after the initial batch of cards, not at the top or the end', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    const all = cards()
    const position = (n: Node) => (toggle().compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) > 0
    expect(position(all[3])).toBe(false) // 4th card precedes the toggle
    expect(position(all[4])).toBe(true) // 5th card follows it
  })

  it('follows the last card when there are fewer than a full batch', async () => {
    searchParams = new URLSearchParams('kind=gathering')
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(1))
    const after = (toggle().compareDocumentPosition(cards()[0]) & Node.DOCUMENT_POSITION_PRECEDING) > 0
    expect(after).toBe(true)
  })

  it('still renders when nothing matches — the map shows the area regardless', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    openSearch()
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'zzzz' } })
    await waitFor(() => expect(screen.getByTestId('explore-empty')).toBeInTheDocument())
    expect(toggle()).toBeInTheDocument()
  })

  it('reserves no fixed space at the bottom beyond the pills and the nav', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    const main = screen.getByTestId('explore-page')
    expect(main.className).not.toMatch(/explore-controls/)
  })
})

describe('T116 — switching between the two renderings', () => {
  const toggleTab = (name: 'List' | 'Map') =>
    within(screen.getByTestId('list-map-toggle')).getByRole('tab', { name })

  it('swaps the card list for the map', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    fireEvent.click(toggleTab('Map'))
    await waitFor(() => expect(screen.getByTestId('explore-map')).toBeInTheDocument())
    expect(cards()).toHaveLength(0)
    expect(toggleTab('Map')).toHaveAttribute('aria-selected', 'true')
  })

  it('swaps back to the cards', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    fireEvent.click(toggleTab('Map'))
    await waitFor(() => expect(screen.getByTestId('explore-map')).toBeInTheDocument())
    fireEvent.click(toggleTab('List'))
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(screen.queryByTestId('explore-map')).not.toBeInTheDocument()
    expect(toggleTab('List')).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps the toggle reachable in map view', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    fireEvent.click(toggleTab('Map'))
    await waitFor(() => expect(screen.getByTestId('explore-map')).toBeInTheDocument())
    expect(screen.getByTestId('list-map-toggle')).toBeInTheDocument()
  })

  it('fades the incoming view in rather than navigating', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    fireEvent.click(toggleTab('Map'))
    await waitFor(() => expect(screen.getByTestId('explore-map')).toBeInTheDocument())
    expect(screen.getByTestId('explore-view-pane').className).toMatch(/explore-fade-in/)
  })

  it('the map renders the same filtered result set', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    openSheet()
    fireEvent.click(within(sheet()).getByRole('checkbox', { name: 'Repair' }))
    showResults()
    await waitFor(() => expect(cards()).toHaveLength(2))
    fireEvent.click(toggleTab('Map'))
    await waitFor(() => expect(screen.getByTestId('explore-map')).toBeInTheDocument())
    expect(screen.getByTestId('explore-map')).toHaveAttribute('data-item-count', '2')
  })
})

describe('T116 — the view is ephemeral session state', () => {
  it('never writes the view into the URL', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    fireEvent.click(within(screen.getByTestId('list-map-toggle')).getByRole('tab', { name: 'Map' }))
    await waitFor(() => expect(screen.getByTestId('explore-map')).toBeInTheDocument())
    for (const call of replace.mock.calls) expect(call[0]).not.toContain('view=')
  })

  it('opens on the list even when a stale link asks for the map', async () => {
    searchParams = new URLSearchParams('view=map')
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(screen.queryByTestId('explore-map')).not.toBeInTheDocument()
  })

  it('keeps the filters in the URL alongside the ephemeral view', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    fireEvent.click(within(screen.getByTestId('list-map-toggle')).getByRole('tab', { name: 'Map' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Events' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/explore?kind=gathering', { scroll: false }))
  })
})

describe('T116 — the toggle waits for the first page', () => {
  it('does not render against an empty grid while the results are still loading', () => {
    // Rendering it before the cards arrive puts it at the top of the page and
    // then shoves it down four cards a moment later.
    renderExplore()
    expect(screen.getByTestId('result-count')).toHaveTextContent('Loading')
    expect(screen.queryByTestId('list-map-toggle')).not.toBeInTheDocument()
  })

  it('appears once the cards land', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(5))
    expect(screen.getByTestId('list-map-toggle')).toBeInTheDocument()
  })
})

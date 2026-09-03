// T117 — Explore reads the items MV and the kind pills filter it end-to-end.
//
// Resolves the T114 deviation: the pills shipped wired to `?kind=` but the
// results were vendor-backed, so every non-All pill matched zero rows.

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
  default: () => function StubMap() {
    return <div data-testid="explore-map" />
  },
}))

const GOOD_MARKET = '0101000020E6100000C3F5285C8F7A5EC0713D0AD7A3A04340'

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
]

/** Records the `.eq()` predicates each fetch sent, and answers from ROWS. */
const eqCalls: [string, unknown][][] = []

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    from: () => {
      const applied: [string, unknown][] = []
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = (c: string, v: unknown) => { applied.push([c, v]); return b }
      b.order = () => b
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

beforeEach(() => {
  eqCalls.length = 0
  replace.mockClear()
  searchParams = new URLSearchParams()
})
afterEach(cleanup)

describe('T117 — Explore is items-backed', () => {
  it('renders a card per published item from the MV', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(4))
    expect(screen.getByText('Country Sourdough Loaf')).toBeInTheDocument()
    expect(screen.getByText('Repair Cafe')).toBeInTheDocument()
  })

  it('links each card to the canonical member-scoped item URL', async () => {
    renderExplore()
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    expect(cards()[0]).toHaveAttribute('href', '/m/maya-okonkwo/p/country-sourdough-loaf-a0000001')
  })

  it('shows the kind label, not a vendor category', async () => {
    renderExplore()
    await waitFor(() => expect(cards().length).toBe(4))
    const labels = screen.getAllByTestId('feed-item-kind').map((n) => n.textContent)
    expect(labels).toEqual(['Product', 'Product', 'Event', 'Service'])
  })

  it('counts results in items, not vendors', async () => {
    renderExplore()
    await waitFor(() => expect(screen.getByTestId('result-count')).toHaveTextContent('4 items'))
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
    await waitFor(() => expect(cards()).toHaveLength(4))
    expect(eqCalls[0]).toEqual([])
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('filters to gatherings when Events is tapped', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(4))
    fireEvent.click(screen.getByRole('tab', { name: 'Events' }))
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(screen.getByText('Repair Cafe')).toBeInTheDocument()
    expect(eqCalls.at(-1)).toEqual([['item_kind', 'gathering']])
  })

  it('filters to services when Services is tapped', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(4))
    fireEvent.click(screen.getByRole('tab', { name: 'Services' }))
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(screen.getByText('Saturday Bike Tune-Up')).toBeInTheDocument()
  })

  it('returns to the full set when All is tapped again', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(4))
    fireEvent.click(screen.getByRole('tab', { name: 'Events' }))
    await waitFor(() => expect(cards()).toHaveLength(1))
    fireEvent.click(screen.getByRole('tab', { name: 'All' }))
    await waitFor(() => expect(cards()).toHaveLength(4))
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
    await waitFor(() => expect(cards()).toHaveLength(4))
    fireEvent.click(screen.getByRole('tab', { name: 'Ideas' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/explore?kind=wonder', { scroll: false }))
  })

  it('keeps the previous results on screen while the next kind loads', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(4))
    fireEvent.click(screen.getByRole('tab', { name: 'Events' }))
    // Synchronously after the tap, before the refetch resolves.
    expect(cards().length).toBe(4)
    expect(screen.getByTestId('result-count')).not.toHaveTextContent('Loading')
  })
})

describe('T117 — the read degrades instead of stranding the tab', () => {
  it('falls through to the empty state when the MV read rejects', async () => {
    const ssr = await import('@supabase/ssr')
    const spy = vi.spyOn(ssr, 'createBrowserClient').mockReturnValue({
      from: () => ({
        select: () => ({ order: () => ({ limit: () => Promise.reject(new Error('offline')) }) }),
      }),
    } as never)
    renderExplore()
    await waitFor(() => expect(screen.getByTestId('explore-empty')).toBeInTheDocument())
    expect(screen.getByTestId('result-count')).not.toHaveTextContent('Loading')
    spy.mockRestore()
  })
})

describe('T117 — search and the empty state', () => {
  it('narrows results by search across item fields', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(4))
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'rye' } })
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(screen.getByText('Seeded Rye Loaf')).toBeInTheDocument()
  })

  it('offers Clear filters when a kind + search combination matches nothing', async () => {
    renderExplore()
    await waitFor(() => expect(cards()).toHaveLength(4))
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'zzzz' } })
    await waitFor(() => expect(cards()).toHaveLength(0))
    const empty = screen.getByTestId('explore-empty')
    expect(within(empty).getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
    fireEvent.click(within(empty).getByRole('button', { name: /clear filters/i }))
    await waitFor(() => expect(cards()).toHaveLength(4))
  })
})

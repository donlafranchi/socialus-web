// T115 — the sticky Explore search row (F045 § "Filter icon replaces dedicated
// filter buttons"; thesis §5 "one row, three elements").

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ExploreSearchBar } from './ExploreSearchBar'

const onQueryChange = vi.fn()
const onOpenFilters = vi.fn()
const onOpenScope = vi.fn()

function renderBar(over: Partial<React.ComponentProps<typeof ExploreSearchBar>> = {}) {
  return render(
    <ExploreSearchBar
      placeName="West Sacramento"
      query=""
      onQueryChange={onQueryChange}
      filtersActive={false}
      onOpenFilters={onOpenFilters}
      onOpenScope={onOpenScope}
      {...over}
    />,
  )
}

beforeEach(() => {
  onQueryChange.mockClear()
  onOpenFilters.mockClear()
  onOpenScope.mockClear()
})
afterEach(cleanup)

describe('T115 — one row, three elements', () => {
  it('shows the locality on the left', () => {
    renderBar()
    expect(screen.getByTestId('explore-location-pill')).toHaveTextContent('West Sacramento')
  })

  // CHANGED 2026-09-17. "Nearby" was a claim, not a neutral label: with nothing
  // resolved the surface does not know the reader is near anything. It now asks.
  it('asks for an area rather than claiming one, before the locality resolves', () => {
    renderBar({ placeName: null })
    const pill = screen.getByTestId('explore-location-pill')
    expect(pill).toHaveTextContent('Choose your area')
    expect(pill).toHaveAttribute('data-place-chosen', 'false')
  })

  it('asks rather than naming the launch stand-in, even when one resolves', () => {
    renderBar({ placeName: 'The Good Place', placeChosen: false })
    const pill = screen.getByTestId('explore-location-pill')
    expect(pill).toHaveTextContent('Choose your area')
    expect(pill.textContent).not.toMatch(/good place/i)
  })

  // Still one row, three elements (F045 thesis §5) — the locality is now the
  // first of the three rather than a label sitting beside two.
  it('offers the area, then search, then filters, in that order', () => {
    renderBar()
    const row = screen.getByTestId('explore-search-bar')
    const labels = within(row)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))
    expect(labels).toEqual(['Area: West Sacramento — change it', 'Search', 'Open filters'])
  })

  it('sticks to the top of the viewport', () => {
    renderBar()
    expect(screen.getByTestId('explore-search-bar').className).toMatch(/sticky/)
  })

  it('shows no separate market, category or day buttons', () => {
    renderBar()
    const row = screen.getByTestId('explore-search-bar')
    expect(within(row).queryByRole('button', { name: /category/i })).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /market/i })).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /day/i })).not.toBeInTheDocument()
  })
})

describe('T115 — the filter icon', () => {
  it('is labelled for assistive tech and announces the dialog it opens', () => {
    renderBar()
    const icon = screen.getByRole('button', { name: 'Open filters' })
    expect(icon).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('opens the sheet when tapped', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'Open filters' }))
    expect(onOpenFilters).toHaveBeenCalled()
  })

  it('carries no dot when no secondary filter is set', () => {
    renderBar()
    expect(screen.queryByTestId('filter-active-dot')).not.toBeInTheDocument()
  })

  it('carries a dot when secondary filters are active', () => {
    renderBar({ filtersActive: true })
    expect(screen.getByTestId('filter-active-dot')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open filters/i })).toHaveAccessibleName(
      'Open filters — filters applied',
    )
  })
})

describe('T115 — the search affordance', () => {
  it('starts collapsed', () => {
    renderBar()
    expect(screen.queryByTestId('search-input')).not.toBeInTheDocument()
  })

  it('expands to an input when the search icon is tapped', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByTestId('search-input')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('starts expanded when a query is already in play, so a shared link shows its own terms', () => {
    renderBar({ query: 'sourdough' })
    expect(screen.getByTestId('search-input')).toHaveValue('sourdough')
  })

  it('reports typing up to the page', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'rye' } })
    expect(onQueryChange).toHaveBeenCalledWith('rye')
  })

  it('clears the query and collapses when the input is dismissed', () => {
    renderBar({ query: 'rye' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onQueryChange).toHaveBeenCalledWith('')
  })
})

describe('the location pill as the scope control', () => {
  it('opens the scope sheet when tapped', () => {
    renderBar()
    fireEvent.click(screen.getByTestId('explore-location-pill'))
    expect(onOpenScope).toHaveBeenCalledOnce()
  })

  it('is a button even before anywhere is chosen — that is the whole point', () => {
    renderBar({ placeName: null, placeChosen: false })
    const pill = screen.getByTestId('explore-location-pill')
    expect(pill.tagName).toBe('BUTTON')
    fireEvent.click(pill)
    expect(onOpenScope).toHaveBeenCalledOnce()
  })
})

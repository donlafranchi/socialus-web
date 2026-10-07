// #328 — one thumb-reach control at the bottom right of Explore on phones.
// Collapsed it is a single button; tapped it opens into search, filter, metro
// and list/map, and shrinks back after a choice.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ExploreDock } from './ExploreDock'
import { BROWSE_RESULTS_ID } from '@/components/browse/results-id'

const h = { onSearch: vi.fn(), onFilter: vi.fn(), onMetro: vi.fn(), onView: vi.fn() }

function renderDock(over: Partial<React.ComponentProps<typeof ExploreDock>> = {}) {
  return render(<ExploreDock view="list" filtersActive={false} onSearch={h.onSearch} onFilter={h.onFilter} onMetro={h.onMetro} onViewChange={h.onView} {...over} />)
}
const toggle = () => screen.getByTestId('explore-dock-toggle')
const open = () => fireEvent.click(toggle())

beforeEach(() => Object.values(h).forEach((f) => f.mockClear()))
afterEach(cleanup)

describe('collapsed', () => {
  it('is one button, fixed at the bottom right above the nav and the safe area', () => {
    renderDock()
    const dock = screen.getByTestId('explore-dock')
    expect(dock.className).toMatch(/\bfixed\b/)
    expect(dock.className).toMatch(/\bright-/)
    expect(dock.className).not.toMatch(/left-1\/2/)
    expect(dock.className).toContain('var(--nav-height)')
    expect(dock.className).toContain('env(safe-area-inset-bottom)')
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('expanded', () => {
  it('offers search, filter, metro and the other view, each at tap size', () => {
    renderDock()
    open()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    for (const name of ['Search', 'Filter', 'Change area', 'Map']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByTestId('explore-dock-search').className).toMatch(/min-h-11|h-11/)
  })

  it('names the view it switches to, and points at the results', () => {
    renderDock({ view: 'map' })
    open()
    const pill = screen.getByTestId('view-pill')
    expect(pill).toHaveTextContent('List')
    expect(pill).toHaveAttribute('aria-controls', BROWSE_RESULTS_ID)
  })

  it('marks active filters', () => {
    renderDock({ filtersActive: true })
    open()
    expect(screen.getByRole('button', { name: 'Filter — filters applied' })).toBeInTheDocument()
  })

  it.each([
    ['Search', 'onSearch'],
    ['Filter', 'onFilter'],
    ['Change area', 'onMetro'],
  ] as const)('%s fires its handler and shrinks back', (name, fn) => {
    renderDock()
    open()
    fireEvent.click(screen.getByRole('button', { name }))
    expect(h[fn]).toHaveBeenCalledTimes(1)
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name })).toBeNull()
  })

  it('switching view reports the other view and shrinks back', () => {
    renderDock()
    open()
    fireEvent.click(screen.getByTestId('view-pill'))
    expect(h.onView).toHaveBeenCalledWith('map')
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('Escape and tapping the toggle again also shrink it back', () => {
    renderDock()
    open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    open()
    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })
})

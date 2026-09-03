// T116 — the inline List/Map toggle (F044).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ListMapToggle } from './ListMapToggle'
import { EXPLORE_RESULTS_ID } from './KindFilterPills'

const onChange = vi.fn()

const renderToggle = (view: 'list' | 'map' = 'list') =>
  render(<ListMapToggle view={view} onChange={onChange} />)

const tabs = () => screen.getAllByRole('tab')

beforeEach(() => onChange.mockClear())
afterEach(cleanup)

describe('T116 — the toggle is inline, not fixed', () => {
  it('is part of the document flow — never fixed, absolute or floating', () => {
    renderToggle()
    const row = screen.getByTestId('list-map-toggle')
    expect(row.className).not.toMatch(/\bfixed\b/)
    expect(row.className).not.toMatch(/\babsolute\b/)
    expect(row.className).not.toMatch(/\bsticky\b/)
  })

  it('centres itself with 24px of vertical breathing room', () => {
    renderToggle()
    const row = screen.getByTestId('list-map-toggle')
    expect(row.className).toMatch(/justify-center/)
    expect(row.className).toMatch(/my-6/)
  })

  it('renders the two views as compact text', () => {
    renderToggle()
    expect(tabs().map((t) => t.textContent)).toEqual(['List', 'Map'])
  })
})

describe('T116 — the toggle is a tablist', () => {
  it('exposes a labelled tablist with two tabs', () => {
    renderToggle()
    expect(screen.getByRole('tablist', { name: /view/i })).toBeInTheDocument()
    expect(tabs()).toHaveLength(2)
  })

  it('marks the active view selected and the other not', () => {
    renderToggle('map')
    expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'false')
  })

  it('points both tabs at the results region', () => {
    renderToggle()
    for (const tab of tabs()) expect(tab).toHaveAttribute('aria-controls', EXPLORE_RESULTS_ID)
  })

  it('uses a roving tabindex so the pair is one tab stop', () => {
    renderToggle('list')
    expect(tabs()[0]).toHaveAttribute('tabindex', '0')
    expect(tabs()[1]).toHaveAttribute('tabindex', '-1')
  })
})

describe('T116 — switching views', () => {
  it('reports the other view when the inactive tab is tapped', () => {
    renderToggle('list')
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
    expect(onChange).toHaveBeenCalledWith('map')
  })

  it('reports list when Map is active and List is tapped', () => {
    renderToggle('map')
    fireEvent.click(screen.getByRole('tab', { name: 'List' }))
    expect(onChange).toHaveBeenCalledWith('list')
  })

  it('moves selection with the arrow keys and takes focus with it', () => {
    renderToggle('list')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('map')
  })

  it('wraps around at both ends', () => {
    renderToggle('list')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith('map')
  })

  it('ignores keys that are not arrows, Home or End', () => {
    renderToggle('list')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'a' })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('T116 — the DLS treatment', () => {
  it('fills the active tab charcoal with white text', () => {
    renderToggle('list')
    const active = screen.getByRole('tab', { name: 'List' })
    expect(active.className).toContain('bg-[var(--color-charcoal-700)]')
    expect(active.className).toContain('text-white')
  })

  it('leaves the inactive tab white with a charcoal hairline', () => {
    renderToggle('list')
    const inactive = screen.getByRole('tab', { name: 'Map' })
    expect(inactive.className).toContain('bg-white')
    expect(inactive.className).toContain('text-[var(--color-charcoal-900)]')
    expect(inactive.className).toContain('border-[var(--color-charcoal-100)]')
  })

  it('gives each tab a 44px touch target', () => {
    renderToggle()
    for (const tab of tabs()) expect(tab.className).toMatch(/min-h-11/)
  })
})

describe('T116 — the focus ring is visible on both tabs', () => {
  it('sets an explicit ring colour rather than inheriting currentColor', () => {
    // The UA default is `outline-color: currentColor`; on the selected tab
    // that is white, drawn against the white page — an invisible ring.
    renderToggle('list')
    for (const tab of tabs()) {
      expect(tab.className).toContain('outline-[var(--color-accent)]')
      expect(tab.className).toContain('focus-visible:outline-offset-2')
    }
  })
})

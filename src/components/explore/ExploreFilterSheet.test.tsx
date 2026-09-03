// T115 — the secondary-filter bottom sheet (F045 § "Bottom sheet opens with
// secondary filters").

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ExploreFilterSheet } from './ExploreFilterSheet'
import { DEFAULT_SECONDARY, type SecondaryFilters } from '@/lib/explore/filters'

const onClose = vi.fn()
const onApply = vi.fn()

function renderSheet(over: Partial<React.ComponentProps<typeof ExploreFilterSheet>> = {}) {
  return render(
    <ExploreFilterSheet
      open
      value={DEFAULT_SECONDARY}
      categories={['food', 'repair']}
      originAvailable
      onClose={onClose}
      onApply={onApply}
      {...over}
    />,
  )
}

const sheet = () => screen.getByRole('dialog')

beforeEach(() => {
  onClose.mockClear()
  onApply.mockClear()
})
afterEach(cleanup)

describe('T115 — the sheet holds the four secondary filters', () => {
  it('renders nothing when closed', () => {
    renderSheet({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers the four radii from the scenario', () => {
    renderSheet()
    for (const mi of ['1 mi', '5 mi', '10 mi', '25 mi']) {
      expect(within(sheet()).getByRole('radio', { name: mi })).toBeInTheDocument()
    }
  })

  it('offers the four schedule options', () => {
    renderSheet()
    for (const label of ['Any time', 'This week', 'This weekend', 'Recurring']) {
      expect(within(sheet()).getByRole('radio', { name: label })).toBeInTheDocument()
    }
  })

  it('offers the categories as a multi-select', () => {
    renderSheet()
    expect(within(sheet()).getByRole('checkbox', { name: 'Food' })).toBeInTheDocument()
    expect(within(sheet()).getByRole('checkbox', { name: 'Repair' })).toBeInTheDocument()
  })

  it('offers the sort orders', () => {
    renderSheet()
    for (const label of ['Newest', 'Starting soonest', 'Nearest', 'Most responses']) {
      expect(within(sheet()).getByRole('radio', { name: label })).toBeInTheDocument()
    }
  })

  it('does not offer a kind selector — the pills own that dimension', () => {
    renderSheet()
    expect(within(sheet()).queryByRole('radio', { name: 'Events' })).not.toBeInTheDocument()
  })

  it('disables the distance-dependent controls when there is no origin to measure from', () => {
    renderSheet({ originAvailable: false })
    expect(within(sheet()).getByRole('radio', { name: '5 mi' })).toBeDisabled()
    expect(within(sheet()).getByRole('radio', { name: 'Nearest' })).toBeDisabled()
    expect(within(sheet()).getByTestId('distance-unavailable')).toBeInTheDocument()
  })

  it('reflects the committed filter state when it opens', () => {
    const value: SecondaryFilters = { distance: 10, schedule: 'weekend', categories: ['repair'], sort: 'nearest' }
    renderSheet({ value })
    expect(within(sheet()).getByRole('radio', { name: '10 mi' })).toBeChecked()
    expect(within(sheet()).getByRole('radio', { name: 'This weekend' })).toBeChecked()
    expect(within(sheet()).getByRole('checkbox', { name: 'Repair' })).toBeChecked()
    expect(within(sheet()).getByRole('radio', { name: 'Nearest' })).toBeChecked()
  })
})

describe('T115 — applying and clearing', () => {
  it('holds edits as a draft until Show results is tapped', () => {
    renderSheet()
    fireEvent.click(within(sheet()).getByRole('radio', { name: '5 mi' }))
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(within(sheet()).getByRole('button', { name: /show results/i }))
    expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_SECONDARY, distance: 5 })
  })

  it('dismisses the sheet when the results are applied', () => {
    renderSheet()
    fireEvent.click(within(sheet()).getByRole('button', { name: /show results/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('discards the draft when the sheet is dismissed without applying', () => {
    const { rerender } = renderSheet()
    fireEvent.click(within(sheet()).getByRole('radio', { name: '5 mi' }))
    fireEvent.keyDown(sheet(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled()
    rerender(
      <ExploreFilterSheet open={false} value={DEFAULT_SECONDARY} categories={['food']} originAvailable onClose={onClose} onApply={onApply} />,
    )
    rerender(
      <ExploreFilterSheet open value={DEFAULT_SECONDARY} categories={['food']} originAvailable onClose={onClose} onApply={onApply} />,
    )
    expect(within(sheet()).getByRole('radio', { name: '5 mi' })).not.toBeChecked()
  })

  it('multi-selects categories', () => {
    renderSheet()
    fireEvent.click(within(sheet()).getByRole('checkbox', { name: 'Food' }))
    fireEvent.click(within(sheet()).getByRole('checkbox', { name: 'Repair' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: /show results/i }))
    expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_SECONDARY, categories: ['food', 'repair'] })
  })

  it('hides Clear all until something is set', () => {
    renderSheet()
    expect(within(sheet()).queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument()
    fireEvent.click(within(sheet()).getByRole('radio', { name: '5 mi' }))
    expect(within(sheet()).getByRole('button', { name: /clear all/i })).toBeInTheDocument()
  })

  it('Clear all resets the draft and applies the empty state', () => {
    renderSheet({ value: { distance: 5, schedule: 'week', categories: ['food'], sort: 'nearest' } })
    fireEvent.click(within(sheet()).getByRole('button', { name: /clear all/i }))
    expect(onApply).toHaveBeenCalledWith(DEFAULT_SECONDARY)
  })

  it('closes on a backdrop tap without applying', () => {
    renderSheet()
    fireEvent.click(screen.getByTestId('filter-sheet-backdrop'))
    expect(onClose).toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled()
  })
})

describe('T115 — the sheet is an accessible dialog', () => {
  it('is a modal dialog with an accessible name', () => {
    renderSheet()
    expect(sheet()).toHaveAttribute('aria-modal', 'true')
    expect(sheet()).toHaveAccessibleName('Filters')
  })

  it('moves focus into the sheet on open', () => {
    renderSheet()
    expect(sheet().contains(document.activeElement)).toBe(true)
  })

  it('traps Tab inside the sheet', () => {
    renderSheet()
    const focusables = within(sheet()).getAllByRole('button')
    const last = focusables[focusables.length - 1]
    last.focus()
    fireEvent.keyDown(sheet(), { key: 'Tab' })
    expect(sheet().contains(document.activeElement)).toBe(true)
  })

  it('wraps Shift+Tab from the first focusable back to the last', () => {
    renderSheet()
    const close = within(sheet()).getByRole('button', { name: /close filters/i })
    close.focus()
    fireEvent.keyDown(sheet(), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).not.toBe(close)
    expect(sheet().contains(document.activeElement)).toBe(true)
  })

  it('restores focus to the trigger when it closes', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { rerender } = renderSheet()
    expect(document.activeElement).not.toBe(trigger)
    rerender(
      <ExploreFilterSheet open={false} value={DEFAULT_SECONDARY} categories={['food']} originAvailable onClose={onClose} onApply={onApply} />,
    )
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('is half-height and internally scrollable, never full-screen', () => {
    renderSheet()
    expect(sheet().className).toMatch(/max-h-\[70vh\]/)
    expect(within(sheet()).getByTestId('filter-sheet-body').className).toMatch(/overflow-y-auto/)
  })
})

describe('T115 — Clear all meets the contrast and target floor', () => {
  it('is charcoal rather than the sub-AA accent token', () => {
    renderSheet({ value: { ...DEFAULT_SECONDARY, distance: 5 } })
    const clear = within(sheet()).getByRole('button', { name: /clear all/i })
    expect(clear.className).toContain('text-[var(--color-charcoal-900)]')
    expect(clear.className).not.toContain('text-[var(--color-accent)]')
  })

  it('carries a full-height touch target', () => {
    renderSheet({ value: { ...DEFAULT_SECONDARY, distance: 5 } })
    expect(within(sheet()).getByRole('button', { name: /clear all/i }).className).toMatch(/min-h-11/)
  })
})

describe('T115 — review fixes', () => {
  it('locks the background scroll while it is open and restores it on close', () => {
    document.body.style.overflow = 'scroll'
    const { rerender } = renderSheet()
    expect(document.body.style.overflow).toBe('hidden')
    rerender(
      <ExploreFilterSheet open={false} value={DEFAULT_SECONDARY} categories={['food']} originAvailable onClose={onClose} onApply={onApply} />,
    )
    expect(document.body.style.overflow).toBe('scroll')
    document.body.style.overflow = ''
  })

  it('keeps the backdrop out of the accessibility tree', () => {
    renderSheet()
    expect(screen.getByTestId('filter-sheet-backdrop')).toHaveAttribute('aria-hidden', 'true')
  })

  it('still lists a selected category the current results no longer contain', () => {
    // Switching kinds can drop a category from the options while it stays
    // selected; the sheet must remain able to turn it off.
    renderSheet({ categories: ['food'], value: { ...DEFAULT_SECONDARY, categories: ['repair'] } })
    const repair = within(sheet()).getByRole('checkbox', { name: 'Repair' })
    expect(repair).toBeChecked()
    fireEvent.click(repair)
    fireEvent.click(within(sheet()).getByRole('button', { name: /show results/i }))
    expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_SECONDARY, categories: [] })
  })
})

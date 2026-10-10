// T115 — the filter bottom sheet, as a container: half-height, internally
// scrollable, dismissed by backdrop / Escape / Show results, edits held as a
// draft until they are committed.
//
// T156 — two of its four groups are gone, and their absence is asserted
// rather than merely untested. Distance and Sort were deleted with the Item
// grain (see `@/lib/browse/filters`); a later port that quietly reintroduced
// either would pass a test suite that only checked what remains.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ExploreFilterSheet } from './ExploreFilterSheet'
import { DEFAULT_BROWSE_FILTERS, type BrowseFilters } from '@/lib/browse/filters'

const onClose = vi.fn()
const onApply = vi.fn()

const TAGS = ['local food', 'repair']

function props(over: Partial<React.ComponentProps<typeof ExploreFilterSheet>> = {}) {
  return {
    open: true,
    value: DEFAULT_BROWSE_FILTERS,
    tags: TAGS,
    onClose,
    onApply,
    ...over,
  }
}

function renderSheet(over: Partial<React.ComponentProps<typeof ExploreFilterSheet>> = {}) {
  return render(<ExploreFilterSheet {...props(over)} />)
}

const sheet = () => screen.getByRole('dialog')

beforeEach(() => {
  onClose.mockClear()
  onApply.mockClear()
})
afterEach(cleanup)

describe('T156 — what the sheet holds, and what it no longer does', () => {
  it('renders nothing when closed', () => {
    renderSheet({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers the three schedule options', () => {
    renderSheet()
    for (const label of ['Any time', 'This week', 'This weekend']) {
      expect(within(sheet()).getByRole('radio', { name: label })).toBeInTheDocument()
    }
  })

  it('offers the tags as a multi-select, labelled as the creator typed them', () => {
    renderSheet()
    expect(within(sheet()).getByRole('checkbox', { name: '#localfood' })).toBeInTheDocument()
    expect(within(sheet()).getByRole('checkbox', { name: '#repair' })).toBeInTheDocument()
  })

  it('offers no distance control — there is no honest point to measure from', () => {
    renderSheet()
    for (const mi of ['1 mi', '5 mi', '10 mi', '25 mi']) {
      expect(within(sheet()).queryByRole('radio', { name: mi })).not.toBeInTheDocument()
    }
    expect(within(sheet()).queryByText(/Distance/)).not.toBeInTheDocument()
  })

  it('offers no sort control — ordering is the server’s', () => {
    renderSheet()
    for (const label of ['Newest', 'Starting soonest', 'Nearest', 'Most responses']) {
      expect(within(sheet()).queryByRole('radio', { name: label })).not.toBeInTheDocument()
    }
  })

  it('offers no Recurring schedule — nothing carries a recurrence rule', () => {
    renderSheet()
    expect(within(sheet()).queryByRole('radio', { name: 'Recurring' })).not.toBeInTheDocument()
  })

  it('offers no Item-kind selector — those kinds are gone with the Items', () => {
    renderSheet()
    for (const label of ['Events', 'Products', 'Services']) {
      expect(within(sheet()).queryByRole('radio', { name: label })).not.toBeInTheDocument()
    }
  })

  it('reflects the committed filter state when it opens', () => {
    const value: BrowseFilters = { schedule: 'weekend', tags: ['repair'] }
    renderSheet({ value })
    expect(within(sheet()).getByRole('radio', { name: 'This weekend' })).toBeChecked()
    expect(within(sheet()).getByRole('checkbox', { name: '#repair' })).toBeChecked()
  })
})

describe('T115 — applying and clearing', () => {
  it('holds edits as a draft until Show results is tapped', () => {
    renderSheet()
    fireEvent.click(within(sheet()).getByRole('radio', { name: 'This week' }))
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(within(sheet()).getByRole('button', { name: /show results/i }))
    expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_BROWSE_FILTERS, schedule: 'week' })
  })

  it('dismisses the sheet when the results are applied', () => {
    renderSheet()
    fireEvent.click(within(sheet()).getByRole('button', { name: /show results/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('discards the draft when the sheet is dismissed without applying', () => {
    const { rerender } = renderSheet()
    fireEvent.click(within(sheet()).getByRole('radio', { name: 'This week' }))
    fireEvent.keyDown(sheet(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled()
    rerender(<ExploreFilterSheet {...props({ open: false })} />)
    rerender(<ExploreFilterSheet {...props()} />)
    expect(within(sheet()).getByRole('radio', { name: 'This week' })).not.toBeChecked()
  })

  it('multi-selects tags', () => {
    renderSheet()
    fireEvent.click(within(sheet()).getByRole('checkbox', { name: '#localfood' }))
    fireEvent.click(within(sheet()).getByRole('checkbox', { name: '#repair' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: /show results/i }))
    expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_BROWSE_FILTERS, tags: ['local food', 'repair'] })
  })

  it('hides Clear all until something is set', () => {
    renderSheet()
    expect(within(sheet()).queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument()
    fireEvent.click(within(sheet()).getByRole('radio', { name: 'This week' }))
    expect(within(sheet()).getByRole('button', { name: /clear all/i })).toBeInTheDocument()
  })

  it('Clear all resets the draft and applies the empty state', () => {
    renderSheet({ value: { schedule: 'week', tags: ['local food'] } })
    fireEvent.click(within(sheet()).getByRole('button', { name: /clear all/i }))
    expect(onApply).toHaveBeenCalledWith(DEFAULT_BROWSE_FILTERS)
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

  it('moves focus into the sheet on open (after the first paint, #530)', async () => {
    renderSheet()
    await waitFor(() => expect(sheet().contains(document.activeElement)).toBe(true))
  })

  it('traps Tab inside the sheet', async () => {
    renderSheet()
    await waitFor(() => expect(sheet().contains(document.activeElement)).toBe(true))
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

  it('restores focus to the trigger when it closes', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { rerender } = renderSheet()
    await waitFor(() => expect(document.activeElement).not.toBe(trigger))
    rerender(<ExploreFilterSheet {...props({ open: false })} />)
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('is half-height and internally scrollable, never full-screen', () => {
    renderSheet()
    // #297 — the shared sheet: capped below full height, its body scrolls.
    expect(sheet().className).toMatch(/max-h-\[\d+vh\]/)
    expect(within(sheet()).getByTestId('filter-sheet-body').parentElement!.className).toMatch(/overflow-y-auto/)
  })
})

describe('T115 — Clear all meets the contrast and target floor', () => {
  it('is charcoal rather than the sub-AA accent token', () => {
    renderSheet({ value: { ...DEFAULT_BROWSE_FILTERS, schedule: 'week' } })
    const clear = within(sheet()).getByRole('button', { name: /clear all/i })
    expect(clear.className).toContain('text-[var(--color-charcoal-900)]')
    expect(clear.className).not.toContain('text-[var(--color-accent)]')
  })

  it('carries a full-height touch target', () => {
    renderSheet({ value: { ...DEFAULT_BROWSE_FILTERS, schedule: 'week' } })
    expect(within(sheet()).getByRole('button', { name: /clear all/i }).className).toMatch(/min-h-tap/)
  })
})

describe('T115 — review fixes', () => {
  it('locks the background scroll while it is open and restores it on close', () => {
    document.body.style.overflow = 'scroll'
    const { rerender } = renderSheet()
    expect(document.body.style.overflow).toBe('hidden')
    rerender(<ExploreFilterSheet {...props({ open: false })} />)
    expect(document.body.style.overflow).toBe('scroll')
    document.body.style.overflow = ''
  })

  it('keeps the backdrop out of the accessibility tree', () => {
    renderSheet()
    expect(screen.getByTestId('filter-sheet-backdrop')).toHaveAttribute('aria-hidden', 'true')
  })

  it('still lists a selected tag the current results no longer contain', () => {
    // A search can drop a tag from the options while it stays selected; the
    // sheet must remain able to turn it off.
    renderSheet({ tags: ['local food'], value: { ...DEFAULT_BROWSE_FILTERS, tags: ['repair'] } })
    const repair = within(sheet()).getByRole('checkbox', { name: '#repair' })
    expect(repair).toBeChecked()
    fireEvent.click(repair)
    fireEvent.click(within(sheet()).getByRole('button', { name: /show results/i }))
    expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_BROWSE_FILTERS, tags: [] })
  })
})

// T115 — removable chips for the active secondary filters (F045 § "Active
// secondary filters render as removable chips" / "Chip row disappears").

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ActiveFilterChips } from './ActiveFilterChips'
import { DEFAULT_SECONDARY, type SecondaryFilters } from '@/lib/explore/filters'

const onRemove = vi.fn()

const FULL: SecondaryFilters = {
  distance: 5,
  schedule: 'weekend',
  categories: ['food'],
  sort: 'nearest',
}

beforeEach(() => onRemove.mockClear())
afterEach(cleanup)

describe('T115 — the chip row', () => {
  it('renders nothing at all when no secondary filter is set', () => {
    const { container } = render(
      <ActiveFilterChips filters={DEFAULT_SECONDARY} onRemove={onRemove} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one chip per active secondary filter', () => {
    render(<ActiveFilterChips filters={FULL} onRemove={onRemove} />)
    expect(screen.getAllByTestId('explore-filter-chip')).toHaveLength(4)
    expect(screen.getByText('Within 5 mi')).toBeInTheDocument()
    expect(screen.getByText('This weekend')).toBeInTheDocument()
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('Sorted by nearest')).toBeInTheDocument()
  })

  it('names each remove control for assistive tech', () => {
    render(<ActiveFilterChips filters={FULL} onRemove={onRemove} />)
    expect(screen.getByRole('button', { name: 'Remove Within 5 mi filter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Food filter' })).toBeInTheDocument()
  })

  it('hands the chip id back when a chip is dismissed', () => {
    render(<ActiveFilterChips filters={FULL} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Food filter' }))
    expect(onRemove).toHaveBeenCalledWith('category:food')
  })

  it('wraps to a second line rather than scrolling horizontally', () => {
    render(<ActiveFilterChips filters={FULL} onRemove={onRemove} />)
    const row = screen.getByTestId('explore-filter-chips')
    expect(row.className).toMatch(/flex-wrap/)
    expect(row.className).not.toMatch(/overflow-x-auto/)
  })

  it('announces the filter state as a labelled group', () => {
    render(<ActiveFilterChips filters={FULL} onRemove={onRemove} />)
    expect(screen.getByRole('group', { name: /active filters/i })).toBeInTheDocument()
  })
})

describe('T115 — the chip remove control is reachable', () => {
  it('grows its hit area to the full chip height', () => {
    render(<ActiveFilterChips filters={FULL} onRemove={onRemove} />)
    const remove = screen.getByRole('button', { name: 'Remove Food filter' })
    expect(remove.className).toMatch(/before:-top-\[5px\]/)
    expect(remove.className).toMatch(/before:-bottom-\[5px\]/)
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { HeartedBy } from './HeartedBy'

afterEach(cleanup)

// #1171 (plan #269, option A, Don 2026-11-02): the poster sees who hearted, by name ("Ana and 4 others"), newest
// first; tapping shows the list. No public count for now: a default, not a ruling, so it is one database switch.
describe('who hearted', () => {
  it('shows the poster the newest name and how many others, and the list on a tap', () => {
    render(<HeartedBy tally={{ count: 5, names: ['Ana', 'Bea', 'Cy', 'Di', 'Ed'] }} />)
    const summary = screen.getByText('Ana and 4 others hearted this')
    fireEvent.click(summary)
    expect(screen.getByRole('list', { name: 'Who hearted this' }).textContent).toBe('AnaBeaCyDiEd')
  })

  it('reads right for one and for two', () => {
    render(<HeartedBy tally={{ count: 1, names: ['Ana'] }} />)
    expect(screen.getByText('Ana hearted this')).toBeInTheDocument()
    cleanup()
    render(<HeartedBy tally={{ count: 2, names: ['Ana', 'Bea'] }} />)
    expect(screen.getByText('Ana and 1 other hearted this')).toBeInTheDocument()
  })

  it('shows anyone else nothing (the database sends them no tally), and a bare count when public counts are on', () => {
    const { container } = render(<HeartedBy tally={undefined} />)
    expect(container).toBeEmptyDOMElement()
    cleanup()
    render(<HeartedBy tally={{ count: 5 }} />)
    expect(screen.getByTestId('hearted-by')).toHaveTextContent(/^5$/)
  })

  it('shows nothing with no hearts', () => {
    const { container } = render(<HeartedBy tally={{ count: 0, names: [] }} />)
    expect(container).toBeEmptyDOMElement()
  })
})

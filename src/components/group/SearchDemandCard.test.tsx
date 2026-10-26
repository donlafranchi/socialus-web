// #909 — the owner's card: what locals near the Page searched this month, only terms searched 3+ times.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SearchDemandCard, SEARCH_DEMAND_COPY } from './SearchDemandCard'

afterEach(cleanup)

describe('SearchDemandCard', () => {
  it('shows the terms that fit the Page and the ones that found nothing, with their counts', () => {
    render(<SearchDemandCard demand={{ fit: [{ query: 'sourdough', searches: 7 }], zero: [{ query: 'ferret food', searches: 3 }] }} />)
    expect(screen.getByRole('heading', { name: SEARCH_DEMAND_COPY.title })).toBeInTheDocument()
    expect(screen.getByText(SEARCH_DEMAND_COPY.onlyYou)).toBeInTheDocument()
    expect(within(screen.getByTestId('demand-fit')).getByText('sourdough')).toBeInTheDocument()
    expect(within(screen.getByTestId('demand-fit')).getByText('7 searches')).toBeInTheDocument()
    expect(within(screen.getByTestId('demand-zero')).getByText('ferret food')).toBeInTheDocument()
  })

  it('leaves out a list with nothing in it', () => {
    render(<SearchDemandCard demand={{ fit: [], zero: [{ query: 'ferret food', searches: 3 }] }} />)
    expect(screen.queryByTestId('demand-fit')).toBeNull()
    expect(screen.getByTestId('demand-zero')).toBeInTheDocument()
  })

  it('is hidden when nothing reached the minimum', () => {
    const { container } = render(<SearchDemandCard demand={{ fit: [], zero: [] }} />)
    expect(container).toBeEmptyDOMElement()
    cleanup()
    const r = render(<SearchDemandCard demand={null} />)
    expect(r.container).toBeEmptyDOMElement()
  })
})

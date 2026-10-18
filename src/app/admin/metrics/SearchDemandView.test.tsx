import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SearchDemandView, type DemandRow } from './SearchDemandView'

// #909 — what locals searched, by week and area: the top searches and the top searches that found nothing.

afterEach(cleanup)
const r = (o: Partial<DemandRow>): DemandRow => ({ week_start: '2026-10-12', area: 'Sacramento', list: 'top', query: 'tacos', searches: 5, ...o })

describe('SearchDemandView', () => {
  it('groups by week and area, with the top and the found-nothing lists apart', () => {
    render(
      <SearchDemandView
        rows={[
          r({}),
          r({ query: 'sourdough', searches: 3 }),
          r({ list: 'zero', query: 'ferret food', searches: 4 }),
          r({ week_start: '2026-10-05', query: 'pumpkins', searches: 9 }),
        ]}
      />,
    )
    const weeks = screen.getAllByTestId('demand-week')
    expect(weeks).toHaveLength(2)
    const now = within(weeks[0])
    expect(now.getByText(/Week of 2026-10-12/)).toBeInTheDocument()
    const top = within(now.getByTestId('demand-top'))
    expect(top.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['tacos5', 'sourdough3'])
    expect(within(now.getByTestId('demand-zero')).getByText('ferret food')).toBeInTheDocument()
    expect(within(weeks[1]).getByText('pumpkins')).toBeInTheDocument()
  })

  it('says so when nothing has been searched yet', () => {
    render(<SearchDemandView rows={[]} />)
    expect(screen.getByTestId('demand-empty')).toBeInTheDocument()
  })
})

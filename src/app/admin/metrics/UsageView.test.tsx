import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ComingBackView, WhatTheyUseView, DropOffView } from './UsageView'

afterEach(cleanup)

describe('F133 — the three answers on the Metrics page', () => {
  it('coming back: one row per join week, newest first, each week since joining in its column', () => {
    render(
      <ComingBackView
        rows={[
          { week: '2026-11-09', join_week: '2026-10-26', active: 22 },
          { week: '2026-10-26', join_week: '2026-10-26', active: 40 },
          { week: '2026-11-09', join_week: '2026-11-09', active: 5 },
        ]}
      />,
    )
    const rows = screen.getAllByTestId('usage-cohort')
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['Nov 9', 'Oct 26'])
    expect(within(rows[1]!).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Oct 26', '40', '', '22'])
  })

  it('what they use: each day, newest first, members per part', () => {
    render(
      <WhatTheyUseView
        rows={[
          { day: '2026-11-11', part: 'explore', members: 3 },
          { day: '2026-11-12', part: 'posts', members: 7 },
          { day: '2026-11-12', part: 'ask', members: 2 },
        ]}
      />,
    )
    const days = screen.getAllByTestId('usage-day')
    expect(within(days[0]!).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Thu, Nov 12', '7', '0', '0', '0', '0', '0', '2'])
    expect(days).toHaveLength(2)
  })

  it('where they drop off: each week, the steps in order', () => {
    render(<DropOffView rows={[{ week: '2026-11-09', step: 'first_post', reached: 1 }, { week: '2026-11-09', step: 'signed_in', reached: 9 }]} />)
    expect(within(screen.getByTestId('usage-week')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Nov 9', '9', '0', '0', '0', '1'])
  })

  it('says so when nothing is counted yet', () => {
    render(
      <>
        <ComingBackView rows={[]} />
        <WhatTheyUseView rows={[]} />
        <DropOffView rows={[]} />
      </>,
    )
    for (const id of ['usage-coming-back-empty', 'usage-parts-empty', 'usage-funnel-empty']) expect(screen.getByTestId(id)).toBeInTheDocument()
  })
})

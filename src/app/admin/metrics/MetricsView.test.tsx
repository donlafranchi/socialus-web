import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MetricsView, type WeekRow } from './MetricsView'

// #544 — plain numbers, this week beside last week. Real counts, no suppression
// (Don, 2026-10-09); counts only, nothing about any one member.

afterEach(cleanup)
const week = (o: Partial<WeekRow> = {}): WeekRow => ({ week_start: '2026-10-05', gatherings: 7, venues: 4, new_members: 3, new_members_connected: 1, members_total: 9, members_unconnected: 2, ...o })

describe('MetricsView', () => {
  it('shows each of the four numbers for this week and last week', () => {
    render(<MetricsView rows={[week(), week({ week_start: '2026-09-28', gatherings: 5, venues: 3, new_members: 4, new_members_connected: 4, members_total: 8, members_unconnected: 1 })]} />)
    const g = within(screen.getByTestId('metric-gatherings'))
    expect(g.getByTestId('this-week')).toHaveTextContent('7')
    expect(g.getByTestId('last-week')).toHaveTextContent('5')
    expect(within(screen.getByTestId('metric-venues')).getByTestId('this-week')).toHaveTextContent('4')
    expect(within(screen.getByTestId('metric-newcomers')).getByTestId('this-week')).toHaveTextContent('1 of 3')
    expect(within(screen.getByTestId('metric-newcomers')).getByTestId('last-week')).toHaveTextContent('4 of 4')
    expect(within(screen.getByTestId('metric-unconnected')).getByTestId('this-week')).toHaveTextContent('2 of 9')
  })
  it('does not hide small numbers: a 1 and a 0 are shown as they are', () => {
    render(<MetricsView rows={[week({ gatherings: 1, venues: 0 }), week({ week_start: '2026-09-28' })]} />)
    expect(within(screen.getByTestId('metric-gatherings')).getByTestId('this-week')).toHaveTextContent(/^1$/)
    expect(within(screen.getByTestId('metric-venues')).getByTestId('this-week')).toHaveTextContent(/^0$/)
    expect(screen.queryByText(/</)).toBeNull()
  })
  it('says connection means follow or join, not meeting', () => {
    render(<MetricsView rows={[week(), week({ week_start: '2026-09-28' })]} />)
    expect(screen.getByTestId('metrics-note')).toHaveTextContent(/follow or join/i)
  })
  it('with no rows (no role in the database) explains instead of showing zeros', () => {
    render(<MetricsView rows={[]} />)
    expect(screen.getByTestId('metrics-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('metric-gatherings')).toBeNull()
  })
  it('shows no member, name, id or list', () => {
    const { container } = render(<MetricsView rows={[week(), week({ week_start: '2026-09-28' })]} />)
    expect(container.querySelectorAll('a, li, ul, ol')).toHaveLength(0)
  })
})

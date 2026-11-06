import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MapTapsView } from './MapTapsView'

afterEach(cleanup)

describe('MapTapsView (plan #258)', () => {
  it('lists each day, newest first, with Show on map and Directions taps', () => {
    render(
      <MapTapsView
        rows={[
          { day: '2026-10-31', show_on_map: 1, directions: 0 },
          { day: '2026-11-01', show_on_map: 4, directions: 7 },
        ]}
      />,
    )
    const days = screen.getAllByTestId('map-taps-day')
    expect(days.map((d) => within(d).getByTestId('map-taps-date').textContent)).toEqual(['Sun, Nov 1', 'Sat, Oct 31'])
    expect(days[0]).toHaveTextContent('4 Show on map · 7 Directions')
  })

  it('says so when nothing is counted yet', () => {
    render(<MapTapsView rows={[]} />)
    expect(screen.getByTestId('map-taps-empty')).toBeInTheDocument()
  })
})

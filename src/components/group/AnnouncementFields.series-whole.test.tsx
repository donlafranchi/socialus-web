// F074 criterion 1, claimed whole: what the composer offers feeds the one schema every series passes through.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { useEffect, useState } from 'react'
import { AnnouncementFields, emptyWhenWhere, type AnnouncementWhenWhere } from './AnnouncementFields'
import { seriesSchema } from '@/lib/posts/series'

vi.mock('@/components/locations/LocationPlaceFields', () => ({ LocationPlaceFields: () => null, initialLocationPlaceFieldsState: {} }))
afterEach(cleanup)

const seen: { value: AnnouncementWhenWhere } = { value: emptyWhenWhere }
function Harness() {
  const [v, setV] = useState(emptyWhenWhere)
  useEffect(() => { seen.value = v }, [v])
  return <AnnouncementFields value={v} onChange={setV} idPrefix="a" now={new Date('2026-10-02T21:20:00Z')} repeats />
}

describe('F074 criterion 1 — a series is weekly on chosen weekdays, with optional bounds, and nothing else', () => {
  // [guards F074.1]
  it('the composer offers only weekday chips and two optional dates; what it records is accepted, and any other shape is refused', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /add a date and time/i }))
    fireEvent.click(screen.getByRole('button', { name: /repeat weekly/i }))
    const group = screen.getByRole('group', { name: 'Repeats weekly on' })
    expect(within(group).getAllByRole('checkbox')).toHaveLength(7)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByLabelText('Date')).toBeNull()
    expect(screen.queryByText(/monthly|every other|interval|daily|nth/i)).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Thursday' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Saturday' }))
    const { days, startsOn, endsOn } = seen.value.repeat
    expect(startsOn).toBe('')
    expect(endsOn).toBe('')
    expect(seriesSchema.parse({ weekdays: days })).toEqual({ weekdays: [4, 6] })
    expect(seriesSchema.parse({ weekdays: days, startsOn: '2026-11-01', endsOn: '2026-12-31' })).toMatchObject({ weekdays: [4, 6] })

    for (const bad of [{ weekdays: [] }, { weekdays: [0] }, { weekdays: [1], every: 2 }, { weekdays: [1], dates: ['2026-06-02'] }, { weekdays: [1], pattern: 'monthly' }]) {
      expect(() => seriesSchema.parse(bad), JSON.stringify(bad)).toThrow()
    }
  })
})

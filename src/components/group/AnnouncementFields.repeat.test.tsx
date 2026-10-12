// #592 (F074.1) — the weekly repeat control: "Repeats weekly on" + weekday chips + "Starts" / "Ends (optional)"
// (the PM, 2026-10-11, as Google Calendar does it). Weekly only; the creator never enters individual dates.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { AnnouncementFields, emptyWhenWhere, type AnnouncementWhenWhere } from './AnnouncementFields'

vi.mock('@/components/locations/LocationPlaceFields', () => ({
  LocationPlaceFields: () => null,
  initialLocationPlaceFieldsState: {},
}))

afterEach(cleanup)
const NOW = new Date('2026-10-02T21:20:00Z')

let latest: AnnouncementWhenWhere = emptyWhenWhere
function Harness({ repeats = true }: { repeats?: boolean }) {
  const [v, setV] = useState(emptyWhenWhere)
  latest = v
  return <AnnouncementFields value={v} onChange={setV} idPrefix="a" now={NOW} repeats={repeats} />
}
const withTime = () => fireEvent.click(screen.getByRole('button', { name: /add a date and time/i }))
const openRepeat = () => {
  withTime()
  fireEvent.click(screen.getByRole('button', { name: /repeat weekly/i }))
}

describe('the weekly repeat control', () => {
  it('is not there when it is not switched on, or when editing one occurrence', () => {
    render(<Harness repeats={false} />)
    withTime()
    expect(screen.queryByRole('button', { name: /repeat weekly/i })).toBeNull()
  })

  it('waits for a time: a repeat needs one', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: /repeat weekly/i })).toBeNull()
    withTime()
    expect(screen.getByRole('button', { name: /repeat weekly/i })).toBeInTheDocument()
  })

  // [guards F074.1 partial: the wording the PM approved — Repeats weekly on, weekday chips, Starts, Ends (optional)]
  it('says Repeats weekly on, with the seven weekdays as chips and an optional start and end', () => {
    render(<Harness />)
    openRepeat()
    const group = screen.getByRole('group', { name: 'Repeats weekly on' })
    for (const name of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(within(group).getByRole('checkbox', { name })).toBeInTheDocument()
    }
    expect(within(group).getByText('Mon')).toBeInTheDocument()
    expect(screen.getByLabelText('Starts', { selector: 'input[type="date"]' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ends (optional)')).toBeInTheDocument()
  })

  // [guards F074.1 partial: the creator never enters individual dates, and no other pattern is offered]
  it('has no single date to enter and no other pattern to choose', () => {
    render(<Harness />)
    openRepeat()
    expect(screen.queryByLabelText('Date')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByText(/monthly|every other|interval|daily/i)).toBeNull()
  })

  it('picking weekdays records them, and tapping again takes one off', () => {
    render(<Harness />)
    openRepeat()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Thursday' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Saturday' }))
    expect(latest.repeat.days).toEqual([4, 6])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Thursday' }))
    expect(latest.repeat.days).toEqual([6])
  })

  it('both dates are optional and are the metro\'s days', () => {
    render(<Harness />)
    openRepeat()
    expect(latest.repeat.startsOn).toBe('')
    expect(latest.repeat.endsOn).toBe('')
    fireEvent.change(screen.getByLabelText('Starts', { selector: 'input[type="date"]' }), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('Ends (optional)'), { target: { value: '2026-12-31' } })
    expect(latest.repeat).toMatchObject({ startsOn: '2026-11-01', endsOn: '2026-12-31' })
    expect(screen.getByLabelText('Ends (optional)')).toHaveAttribute('min', '2026-11-01')
  })

  it('the time of day stays, labelled so it is not mistaken for the start date', () => {
    render(<Harness />)
    openRepeat()
    expect(screen.getByLabelText('Starts at')).toHaveAttribute('type', 'time')
    expect(screen.getByLabelText('Ends at')).toHaveAttribute('type', 'time')
  })

  it("Doesn't repeat puts the single date back and clears the repeat", () => {
    render(<Harness />)
    openRepeat()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Thursday' }))
    fireEvent.click(screen.getByRole('button', { name: /doesn.t repeat/i }))
    expect(latest.repeat).toEqual({ open: false, days: [], startsOn: '', endsOn: '' })
    expect(screen.getByLabelText('Date')).toBeInTheDocument()
  })
})

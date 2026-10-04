// #317 — date and time pickers that are easy to use: the phone's own pickers,
// labelled, with sensible defaults, still optional.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { AnnouncementFields, emptyWhenWhere, type AnnouncementWhenWhere } from './AnnouncementFields'

vi.mock('@/components/locations/LocationPlaceFields', () => ({
  LocationPlaceFields: () => null,
  initialLocationPlaceFieldsState: {},
}))

afterEach(cleanup)
// 2026-10-02 14:20 in Sacramento.
const NOW = new Date('2026-10-02T21:20:00Z')

function Harness({ initial = emptyWhenWhere }: { initial?: AnnouncementWhenWhere }) {
  const [v, setV] = useState(initial)
  return <AnnouncementFields value={v} onChange={setV} idPrefix="a" now={NOW} />
}

describe('#317 — when is it', () => {
  it('stays optional: no date until asked for', () => {
    render(<Harness />)
    expect(screen.queryByTestId('a-date')).toBeNull()
    expect(screen.getByRole('button', { name: /add a date and time/i })).toBeInTheDocument()
  })

  it('asking for one fills today, the next whole hour, and an hour later', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /add a date and time/i }))
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-02')
    expect(screen.getByLabelText('Starts')).toHaveValue('15:00')
    expect(screen.getByLabelText('Ends')).toHaveValue('16:00')
  })

  it('the end follows the start until the owner sets it', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /add a date and time/i }))
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '18:30' } })
    expect(screen.getByLabelText('Ends')).toHaveValue('19:30')
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '21:00' } })
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '19:00' } })
    expect(screen.getByLabelText('Ends')).toHaveValue('21:00')
  })

  it('uses the phone\'s own pickers, full size, and refuses a past date', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /add a date and time/i }))
    const date = screen.getByLabelText('Date')
    expect(date).toHaveAttribute('type', 'date')
    expect(date).toHaveAttribute('min', '2026-10-02')
    expect(screen.getByLabelText('Starts')).toHaveAttribute('type', 'time')
    expect(date.className).toMatch(/min-h-tap/)
  })

  it('No particular time takes it all away again', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /add a date and time/i }))
    fireEvent.click(screen.getByRole('button', { name: /no particular time/i }))
    expect(screen.queryByLabelText('Date')).toBeNull()
  })

  it('a post that already has a time shows it', () => {
    render(<Harness initial={{ ...emptyWhenWhere, date: '2026-10-09', time: '19:00', endTime: '21:00' }} />)
    expect(screen.getByLabelText('Starts')).toHaveValue('19:00')
  })
})

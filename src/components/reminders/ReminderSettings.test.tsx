// #945 — on You → Alerts: when reminders come (evening before, 1 hour before), and the member's reminders, each removable.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ReminderSettings } from './ReminderSettings'

afterEach(cleanup)

const LIST = [
  { id: 'r1', label: 'Maidu Park Farmers Market, every time', href: '/g/abc123' },
  { id: 'r2', label: 'R945 Hall, Sat, Oct 24, 7:00 PM', href: '/g/def456' },
]

describe('ReminderSettings', () => {
  it('both timings start on, and each turns off on its own', async () => {
    const save = vi.fn(async (c: object) => ({ ok: true as const, prefs: { remindEvening: false, remindHour: true, ...c } }))
    render(<ReminderSettings initial={{ remindEvening: true, remindHour: true }} save={save} list={[]} remove={vi.fn()} />)
    expect(screen.getByRole('switch', { name: 'The evening before' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: '1 hour before' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('switch', { name: 'The evening before' }))
    await waitFor(() => expect(screen.getByRole('switch', { name: 'The evening before' }).getAttribute('aria-checked')).toBe('false'))
    expect(save).toHaveBeenCalledWith({ remindEvening: false })
  })
  it('lists the reminders, and Remove takes one away', async () => {
    const remove = vi.fn(async () => ({ ok: true }))
    render(<ReminderSettings initial={{ remindEvening: true, remindHour: true }} save={vi.fn()} list={LIST} remove={remove} />)
    expect(screen.getByRole('link', { name: 'Maidu Park Farmers Market, every time' }).getAttribute('href')).toBe('/g/abc123')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove reminder' })[0]!)
    await waitFor(() => expect(screen.queryByText('Maidu Park Farmers Market, every time')).toBeNull())
    expect(remove).toHaveBeenCalledWith('r1')
    expect(screen.getByText('R945 Hall, Sat, Oct 24, 7:00 PM')).toBeTruthy()
  })
  it('none yet: says how to get one', () => {
    render(<ReminderSettings initial={{ remindEvening: true, remindHour: true }} save={vi.fn()} list={[]} remove={vi.fn()} />)
    expect(screen.getByText('No reminders yet. Tap Remind me on a post.')).toBeTruthy()
  })
})

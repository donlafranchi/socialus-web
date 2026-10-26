// #904 — the screen a notification opens: one open counted, one tap turns that kind off, the marker leaves the address.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PushLandingBar, kindFromVia } from './PushLandingBar'

vi.mock('@/app/_actions/notification-actions', () => ({ countNotificationOpenAction: vi.fn(), turnOffNotificationKindAction: vi.fn() }))
vi.mock('@/app/_actions/reminder-actions', () => ({ removeReminderAction: vi.fn() }))

afterEach(() => window.history.replaceState(null, '', '/'))

describe('PushLandingBar', () => {
  it('reads only the two kinds', () => {
    expect(kindFromVia('?via=push-weekend')).toBe('weekend')
    expect(kindFromVia('?via=push-follow_posts&x=1')).toBe('follow_posts')
    expect(kindFromVia('?via=email')).toBeNull()
    expect(kindFromVia('?via=reminder&r=0e6f')).toBe('reminder')
  })
  it('shows nothing without the marker', () => {
    render(<PushLandingBar actions={{ countOpen: vi.fn(), turnOff: vi.fn(), stopReminder: vi.fn() }} />)
    expect(screen.queryByTestId('push-landing-bar')).toBeNull()
  })
  it('counts the open once, cleans the address, and turns the kind off in one tap', async () => {
    window.history.replaceState(null, '', '/explore?schedule=weekend&via=push-weekend')
    const countOpen = vi.fn(async () => ({}))
    const turnOff = vi.fn(async () => ({ ok: true }))
    render(<PushLandingBar actions={{ countOpen, turnOff, stopReminder: vi.fn() }} />)
    expect(await screen.findByText('You get this every Thursday.')).toBeTruthy()
    expect(countOpen).toHaveBeenCalledTimes(1)
    expect(countOpen).toHaveBeenCalledWith('weekend')
    expect(window.location.search).toBe('?schedule=weekend')
    fireEvent.click(screen.getByTestId('push-landing-off'))
    await waitFor(() => expect(screen.getByText('Turned off. You can turn them back on under You.')).toBeTruthy())
    expect(turnOff).toHaveBeenCalledWith('weekend')
    expect(screen.queryByTestId('push-landing-off')).toBeNull()
  })
  // #945 — a reminder (push or email) lands on its Page: one tap stops that reminder.
  it('a reminder: counts the open, cleans both markers, and stops that reminder in one tap', async () => {
    window.history.replaceState(null, '', '/g/abc123?via=reminder&r=4c7d2a10-1111-4222-8333-944455556666')
    const countOpen = vi.fn(async () => ({}))
    const stopReminder = vi.fn(async () => ({ ok: true }))
    render(<PushLandingBar actions={{ countOpen, turnOff: vi.fn(), stopReminder }} />)
    expect(await screen.findByText('You asked for a reminder.')).toBeTruthy()
    expect(countOpen).toHaveBeenCalledWith('reminder')
    expect(window.location.search).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Stop reminding me' }))
    await waitFor(() => expect(screen.getByText('Reminder removed.')).toBeTruthy())
    expect(stopReminder).toHaveBeenCalledWith('4c7d2a10-1111-4222-8333-944455556666')
  })
})

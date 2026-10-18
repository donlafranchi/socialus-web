// #904 — the screen a notification opens: one open counted, one tap turns that kind off, the marker leaves the address.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PushLandingBar, kindFromVia } from './PushLandingBar'

vi.mock('@/app/_actions/notification-actions', () => ({ countNotificationOpenAction: vi.fn(), turnOffNotificationKindAction: vi.fn() }))

afterEach(() => window.history.replaceState(null, '', '/'))

describe('PushLandingBar', () => {
  it('reads only the two kinds', () => {
    expect(kindFromVia('?via=push-weekend')).toBe('weekend')
    expect(kindFromVia('?via=push-follow_posts&x=1')).toBe('follow_posts')
    expect(kindFromVia('?via=email')).toBeNull()
  })
  it('shows nothing without the marker', () => {
    render(<PushLandingBar actions={{ countOpen: vi.fn(), turnOff: vi.fn() }} />)
    expect(screen.queryByTestId('push-landing-bar')).toBeNull()
  })
  it('counts the open once, cleans the address, and turns the kind off in one tap', async () => {
    window.history.replaceState(null, '', '/explore?schedule=weekend&via=push-weekend')
    const countOpen = vi.fn(async () => ({}))
    const turnOff = vi.fn(async () => ({ ok: true }))
    render(<PushLandingBar actions={{ countOpen, turnOff }} />)
    expect(await screen.findByText('You get this every Thursday.')).toBeTruthy()
    expect(countOpen).toHaveBeenCalledTimes(1)
    expect(countOpen).toHaveBeenCalledWith('weekend')
    expect(window.location.search).toBe('?schedule=weekend')
    fireEvent.click(screen.getByTestId('push-landing-off'))
    await waitFor(() => expect(screen.getByText('Turned off. You can turn them back on under You.')).toBeTruthy())
    expect(turnOff).toHaveBeenCalledWith('weekend')
    expect(screen.queryByTestId('push-landing-off')).toBeNull()
  })
})

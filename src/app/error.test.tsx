// #490 — a route error is reported, and the member still sees the same page.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException }))

import ErrorPage from './error'

afterEach(() => {
  cleanup()
  captureException.mockClear()
})

describe('the route error state', () => {
  it('reports the error once, and still says something went wrong', () => {
    const err = new Error('boom')
    render(<ErrorPage error={err} reset={() => {}} />)
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(err)
    expect(screen.getByText("That didn't go through")).toBeInTheDocument()
  })
  it('points to the status page, which works even when the app does not', () => {
    render(<ErrorPage error={new Error('boom')} reset={() => {}} />)
    expect(screen.getByRole('link', { name: /status page/i })).toHaveAttribute('href', 'https://stats.uptimerobot.com/11Jx7n72Sp')
  })
})

describe('the root error page', () => {
  it('points to the status page too', async () => {
    const { default: GlobalError } = await import('./global-error')
    render(<GlobalError error={new Error('boom')} reset={() => {}} />, { container: document.documentElement })
    expect(screen.getByRole('link', { name: /status page/i })).toHaveAttribute('href', 'https://stats.uptimerobot.com/11Jx7n72Sp')
  })
})

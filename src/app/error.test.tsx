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
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })
})

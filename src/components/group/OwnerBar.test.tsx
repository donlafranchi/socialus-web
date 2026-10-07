// The owner surface. Don, 2026-09-18: opening their page should open another
// surface where these things can be changed and their tools become available.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { OwnerBar } from './OwnerBar'

afterEach(cleanup)

describe('the owner bar', () => {
  // #456 — the PM, 2026-10-06: one primary action; Edit is the pencil (LinkedIn, Google Business Profile).
  it('Announce is the one primary, and Edit is a pencil to the Edit Page', () => {
    render(<OwnerBar pagePath="/g/7k3x8m" />)
    expect(screen.getByTestId('owner-announce').className).toMatch(/\bbtn-primary\b/)
    const edit = screen.getByRole('link', { name: 'Edit Page' })
    expect(edit).toHaveAttribute('href', '/g/7k3x8m/edit')
    expect(edit).toHaveTextContent('')
    expect(edit.className).toMatch(/\bsize-tap\b/)
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
  })

  it('says whose it is and that nobody else sees it', () => {
    render(<OwnerBar pagePath="/g/x-abc123" />)
    expect(screen.getByTestId('owner-bar')).toHaveTextContent(/only you see this/i)
  })
})

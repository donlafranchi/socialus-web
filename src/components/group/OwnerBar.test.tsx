// The owner surface. Don, 2026-09-18: opening their page should open another
// surface where these things can be changed and their tools become available.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { OwnerBar } from './OwnerBar'

afterEach(cleanup)

describe('the owner bar', () => {
  // #412 — the PM, 2026-10-06: Edit goes to the Edit Page's section cards,
  // not an edit mode with buttons sprinkled over the Page.
  it('offers Edit, to the Edit Page, and Announce, in plain sight', () => {
    render(<OwnerBar pagePath="/g/oak-park-sourdough-7k3x8m" />)
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/g/oak-park-sourdough-7k3x8m/edit')
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.getByTestId('owner-announce')).toBeInTheDocument()
  })

  it('Announce is secondary: the composer has the one primary', () => {
    render(<OwnerBar pagePath="/g/x-abc123" />)
    expect(screen.getByTestId('owner-announce').className).not.toMatch(/btn-primary/)
  })

  it('says whose it is and that nobody else sees it', () => {
    render(<OwnerBar pagePath="/g/x-abc123" />)
    expect(screen.getByTestId('owner-bar')).toHaveTextContent(/only you see this/i)
  })
})

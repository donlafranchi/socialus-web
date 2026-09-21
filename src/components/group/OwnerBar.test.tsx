// The owner surface. Don, 2026-09-18: opening their page should open another
// surface where these things can be changed and their tools become available.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { OwnerBar } from './OwnerBar'

afterEach(cleanup)

describe('the owner bar', () => {
  it('offers edit and announce, in plain sight rather than an overflow menu', () => {
    render(<OwnerBar pagePath="/g/oak-park-sourdough-7k3x8m" />)
    expect(screen.getByTestId('owner-edit')).toHaveAttribute(
      'href',
      '/g/oak-park-sourdough-7k3x8m/edit',
    )
    expect(screen.getByTestId('owner-announce')).toBeInTheDocument()
  })

  // Issue #175 — edit hangs off the Page's own address now, rather than being
  // reassembled into a second top-level route. The canonical address is one
  // dynamic segment, so a child route is allowed; the catch-all it used to
  // live under is what forced `/manage/<slug>` in the first place.
  it('hangs the edit surface off the Page, not off a parallel route', () => {
    render(<OwnerBar pagePath="/g/sacriver-floaters-q4vw2n" />)
    const href = screen.getByTestId('owner-edit').getAttribute('href')
    expect(href).toBe('/g/sacriver-floaters-q4vw2n/edit')
    expect(href).not.toContain('/manage/')
  })

  it('says whose it is and that nobody else sees it', () => {
    render(<OwnerBar pagePath="/g/x-abc123" />)
    expect(screen.getByTestId('owner-bar')).toHaveTextContent(/only you see this/i)
  })
})

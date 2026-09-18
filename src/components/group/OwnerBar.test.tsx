// The owner surface. Don, 2026-09-18: opening their page should open another
// surface where these things can be changed and their tools become available.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { OwnerBar } from './OwnerBar'

afterEach(cleanup)

describe('the owner bar', () => {
  it('offers edit and announce, in plain sight rather than an overflow menu', () => {
    render(<OwnerBar pagePath="/p/oak-park-sourdough" />)
    expect(screen.getByTestId('owner-edit')).toHaveAttribute('href', '/manage/oak-park-sourdough')
    expect(screen.getByTestId('owner-announce')).toBeInTheDocument()
  })

  it('says whose it is and that nobody else sees it', () => {
    render(<OwnerBar pagePath="/p/x" />)
    expect(screen.getByTestId('owner-bar')).toHaveTextContent(/only you see this/i)
  })
})

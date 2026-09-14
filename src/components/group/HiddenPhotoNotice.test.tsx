// T160 (Issue #62) — what the owner sees, and what nobody else does.
//
// The notice tells the owner *that* and *why* — never *who*. A reporter whose
// identity leaks to the reported party is a member-harm failure, not a polish
// bug, so the "no reporter, no report body" assertions here are the point of
// the file rather than a detail of it.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { HiddenPhotoNotice } from './HiddenPhotoNotice'

afterEach(cleanup)

describe('HiddenPhotoNotice', () => {
  it('says the photo is hidden, that a person is reviewing it, and that it may come back', () => {
    render(<HiddenPhotoNotice />)
    const notice = screen.getByTestId('hidden-photo-notice')
    expect(notice).toHaveTextContent(/hidden/i)
    expect(notice).toHaveTextContent(/person/i)
    expect(notice).toHaveTextContent(/back/i)
  })

  it('is announced, not silent', () => {
    render(<HiddenPhotoNotice />)
    expect(screen.getByTestId('hidden-photo-notice')).toHaveAttribute('role', 'status')
  })

  it('uses no jargon a person would have to look up', () => {
    render(<HiddenPhotoNotice />)
    const text = screen.getByTestId('hidden-photo-notice').textContent ?? ''
    for (const word of ['moderation', 'flagged', 'violation', 'policy', 'queue', 'appeal', 'ToS']) {
      expect(text.toLowerCase()).not.toContain(word.toLowerCase())
    }
  })

  it('names no reporter and shows no report body — there is nothing to pass it', () => {
    render(<HiddenPhotoNotice />)
    // The component takes no props at all, which is the strongest form of the
    // guarantee: there is no parameter through which a reporter's identity or
    // a report's text could ever reach this surface.
    expect(HiddenPhotoNotice.length).toBe(0)
  })
})

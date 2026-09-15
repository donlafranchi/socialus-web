// F086 (thin front) — the app says whether you are in, and lets you leave.
//
// Don could not tell whether he was signed in, and there was no way to sign
// out. Both are in the navigation, which is the one thing on every screen.
//
// The word is **You** — the nav tab and the route already use it, and
// role-language.md says the identity noun is lowercase and nearly invisible
// while direct address is "you". Not "account", not "profile".

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { YouBadge } from './YouBadge'

afterEach(cleanup)

const signOut = vi.fn()
const onSignedOut = vi.fn()

beforeEach(() => {
  signOut.mockReset()
  onSignedOut.mockReset()
  signOut.mockResolvedValue({ error: null })
})

function renderBadge(over: Partial<Parameters<typeof YouBadge>[0]> = {}) {
  return render(
    <YouBadge
      loading={false}
      displayName="Maya Rivera"
      photoUrl={null}
      signOut={signOut}
      onSignedOut={onSignedOut}
      {...over}
    />,
  )
}

describe('signed in', () => {
  it('says who you are', () => {
    renderBadge()
    expect(screen.getByTestId('you-badge')).toHaveTextContent('Maya Rivera')
  })

  it('shows a mark in place of the photo nobody has yet', () => {
    renderBadge()
    expect(screen.getByTestId('person-mark')).toHaveTextContent('M')
  })

  it('offers a way out', () => {
    renderBadge()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('signs out when asked', async () => {
    renderBadge()
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })

  it('tells the page it happened, so the view can refresh', async () => {
    renderBadge()
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(onSignedOut).toHaveBeenCalled())
  })

  it('falls back to the handle when there is no display name', () => {
    renderBadge({ displayName: '', handle: 'maya' })
    expect(screen.getByTestId('you-badge')).toHaveTextContent('maya')
  })

  it('says something rather than nothing when it knows neither', () => {
    renderBadge({ displayName: '', handle: '' })
    expect(screen.getByTestId('you-badge')).toHaveTextContent(/signed in/i)
  })
})

describe('signed out', () => {
  it('offers a way in, in the same place', () => {
    renderBadge({ displayName: null })
    const link = screen.getByTestId('you-badge-signin')
    expect(link).toHaveAttribute('href', expect.stringContaining('/auth/login'))
  })

  it('shows no name and no sign out', () => {
    renderBadge({ displayName: null })
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('person-mark')).not.toBeInTheDocument()
  })
})

describe('while it does not know yet', () => {
  it('renders nothing rather than flashing the wrong state', () => {
    // A badge that says "Sign in" for a moment to someone already signed in is
    // worse than a badge that waits.
    const { container } = renderBadge({ loading: true })
    expect(container.textContent).toBe('')
  })
})

describe('failure', () => {
  it('says so and leaves you signed in', async () => {
    signOut.mockResolvedValue({ error: new Error('nope') })
    renderBadge()
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByTestId('you-badge')).toHaveTextContent('Maya Rivera')
    expect(onSignedOut).not.toHaveBeenCalled()
  })
})

describe('voice.md', () => {
  it('names no person as a category, uses no em dash, and is not an account', () => {
    for (const props of [{}, { displayName: null }, { displayName: '', handle: '' }]) {
      const { container, unmount } = renderBadge(props)
      const text = container.textContent ?? ''
      expect(text).not.toMatch(/\b(vendor|producer|seller|maker|supporter|consumer|patron|creator)s?\b/i)
      expect(text).not.toContain('—')
      expect(text.toLowerCase()).not.toContain('account')
      expect(text.toLowerCase()).not.toContain('profile')
      unmount()
    }
  })
})

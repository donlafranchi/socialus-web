// F067 — the control on a Page.
//
// Privacy decides the word: a private Page is joined, anything else is
// followed (Don, 2026-09-15). voice.md applies to every string here: no
// person-nouns, no em dashes, and nothing is called a shop.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { FollowPageButton } from './FollowPageButton'

afterEach(cleanup)

const follow = vi.fn()
const unfollow = vi.fn()

beforeEach(() => {
  follow.mockReset()
  unfollow.mockReset()
  follow.mockResolvedValue({ ok: true as const, relationship: 'follower' as const })
  unfollow.mockResolvedValue({ ok: true as const })
})

function renderBtn(over: Partial<Parameters<typeof FollowPageButton>[0]> = {}) {
  return render(
    <FollowPageButton
      groupId="g1"
      isPrivate={false}
      loggedIn
      following={false}
      onFollow={follow}
      onUnfollow={unfollow}
      {...over}
    />,
  )
}

describe('an open Page is followed', () => {
  it('offers Follow', () => {
    renderBtn()
    expect(screen.getByRole('button', { name: /^Follow$/i })).toBeInTheDocument()
  })

  it('reads Following once you do', () => {
    renderBtn({ following: true })
    expect(screen.getByRole('button', { name: /^Following$/i })).toBeInTheDocument()
  })

  it('calls follow with the Page', async () => {
    renderBtn()
    fireEvent.click(screen.getByRole('button', { name: /^Follow$/i }))
    await waitFor(() => expect(follow).toHaveBeenCalledWith({ groupId: 'g1' }))
  })

  it('flips to Following without a reload', async () => {
    renderBtn()
    fireEvent.click(screen.getByRole('button', { name: /^Follow$/i }))
    expect(await screen.findByRole('button', { name: /^Following$/i })).toBeInTheDocument()
  })

  it('unfollows from the Following state', async () => {
    renderBtn({ following: true })
    fireEvent.click(screen.getByRole('button', { name: /^Following$/i }))
    await waitFor(() => expect(unfollow).toHaveBeenCalledWith({ groupId: 'g1' }))
    expect(await screen.findByRole('button', { name: /^Follow$/i })).toBeInTheDocument()
  })
})

describe('a private Page is joined', () => {
  it('offers Join, never Follow', () => {
    renderBtn({ isPrivate: true })
    expect(screen.getByRole('button', { name: /^Join$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Follow$/i })).not.toBeInTheDocument()
  })

  it('reads Joined once you have', () => {
    renderBtn({ isPrivate: true, following: true })
    expect(screen.getByRole('button', { name: /^Joined$/i })).toBeInTheDocument()
  })

  it('goes through the same action', async () => {
    renderBtn({ isPrivate: true })
    fireEvent.click(screen.getByRole('button', { name: /^Join$/i }))
    await waitFor(() => expect(follow).toHaveBeenCalledWith({ groupId: 'g1' }))
  })
})

describe('signed out', () => {
  // #297 — the same Follow, which opens the sign-in sheet rather than leaving.
  it('opens the sign-in sheet rather than a dead end', () => {
    renderBtn({ loggedIn: false })
    fireEvent.click(screen.getByRole('button', { name: /^Follow$/i }))
    expect(screen.getByRole('dialog', { name: /sign in to follow/i })).toBeInTheDocument()
    expect(screen.getByTestId('sign-in-prompt-continue')).toHaveAttribute('href', expect.stringContaining('/auth/login'))
  })

  it('comes back to the Page afterwards', () => {
    renderBtn({ loggedIn: false, returnTo: '/p/ca/sacramento/g/the-good-loaf' })
    fireEvent.click(screen.getByRole('button', { name: /^Follow$/i }))
    const href = screen.getByTestId('sign-in-prompt-continue').getAttribute('href')!
    expect(decodeURIComponent(href)).toContain('/p/ca/sacramento/g/the-good-loaf')
  })

  it('never reaches the action', () => {
    renderBtn({ loggedIn: false })
    fireEvent.click(screen.getByRole('button', { name: /^Follow$/i }))
    expect(follow).not.toHaveBeenCalled()
  })
})

describe('#297 — the done state carries a check', () => {
  it('Following and Joined show one, without it entering the name', () => {
    renderBtn({ following: true })
    const btn = screen.getByRole('button', { name: /^Following$/i })
    expect(btn.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })
})

describe('failure', () => {
  it('says so and stays put', async () => {
    follow.mockRejectedValue(new Error('nope'))
    renderBtn()
    fireEvent.click(screen.getByRole('button', { name: /^Follow$/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Follow$/i })).toBeInTheDocument()
  })
})

describe('voice.md', () => {
  it('never says shop, and never names a person as a category', () => {
    for (const props of [{}, { isPrivate: true }, { following: true }, { loggedIn: false }]) {
      const { container, unmount } = renderBtn(props)
      const text = container.textContent ?? ''
      expect(text.toLowerCase()).not.toContain('shop')
      expect(text).not.toMatch(/\b(vendor|producer|seller|maker|supporter|consumer|patron|creator)s?\b/i)
      expect(text).not.toContain('—')
      unmount()
    }
  })
})

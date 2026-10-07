import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// #407 — the Password row's line is a sentence, not a value: at 390 it was cut to "Sign in without a…".

const query = { select: () => query, eq: () => query, order: () => query, limit: async () => ({ data: [] }), maybeSingle: async () => ({ data: null }) }
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'maya@example.test' } } }) },
    from: () => query,
  }),
}))
vi.mock('@/components/member/OwnPages', () => ({ OwnPages: () => null }))
vi.mock('@/components/follows/FollowingSummary', () => ({ FollowingSummary: () => null }))
vi.mock('@/components/auth/SignOutButton', () => ({ SignOutButton: () => null }))

import YouPage from './page'

afterEach(cleanup)

describe('#407 — You → Settings → Password', () => {
  it('shows its whole line instead of truncating it', async () => {
    render(await YouPage())
    const line = screen.getByText('Sign in without an email')
    expect(line).not.toHaveClass('truncate')
  })

  it('still truncates a long email', async () => {
    render(await YouPage())
    expect(screen.getByTestId('settings-email').querySelector('.truncate')).toHaveTextContent('maya@example.test')
  })
})

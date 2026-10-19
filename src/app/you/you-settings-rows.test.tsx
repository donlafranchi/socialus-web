import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// One way in (the PM, 2026-10-18): the emailed code. You has no Password row any more.

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

describe('You → Settings', () => {
  it('offers no password to set', async () => {
    render(await YouPage())
    expect(screen.queryByTestId('settings-password')).toBeNull()
    expect(screen.queryByText(/password/i)).toBeNull()
  })

  it('still truncates a long email', async () => {
    render(await YouPage())
    expect(screen.getByTestId('settings-email').querySelector('.truncate')).toHaveTextContent('maya@example.test')
  })
})

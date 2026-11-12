import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// #909 — You → Settings → Searches: the opt-out, reading the member's stored choice (default on).

let row: Record<string, unknown> | null = null
const query = { select: () => query, eq: () => query, order: () => query, limit: async () => ({ data: [] }), maybeSingle: async () => ({ data: row }) }
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'maya@example.test' } } }) },
    from: () => query,
    rpc: async () => ({ data: null }),
  }),
}))
vi.mock('@/components/member/OwnPages', () => ({ OwnPages: () => null }))
vi.mock('@/components/follows/FollowingSummary', () => ({ FollowingSummary: () => null }))
vi.mock('@/components/auth/SignOutButton', () => ({ SignOutButton: () => null }))

import YouPage from './page'

// #1271 — the sign-in card loads the front page's webfont through next/font/local, which needs a Next build.
vi.mock('next/font/local', () => ({ default: () => ({ variable: '--font-landing', className: 'aime' }) }))

afterEach(cleanup)

describe('#909 — You → Settings → Searches', () => {
  it('is on unless the member turned it off', async () => {
    row = { display_name: 'Maya', zip: null, home_market_key: null, search_sharing: true }
    render(await YouPage())
    expect(screen.getByTestId('settings-searches')).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeChecked()
  })

  it('shows off when the member turned it off', async () => {
    row = { display_name: 'Maya', zip: null, home_market_key: null, search_sharing: false }
    render(await YouPage())
    expect(screen.getByRole('switch')).not.toBeChecked()
  })
})

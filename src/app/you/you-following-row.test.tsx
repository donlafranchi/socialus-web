import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// #962 — Don, 2026-10-19: "Shouldn't I be able to see which businesses I follow from within the app?"
// A Following row near the top of You, saying how many Pages, opening the Following page.

const query = { select: () => query, eq: () => query, order: () => query, limit: async () => ({ data: [] }), maybeSingle: async () => ({ data: null }) }
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'maya@example.test' } } }) },
    from: () => query,
  }),
}))
const pages = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: 'group', entityId: `g${i}` }))
const follows = vi.fn(async () => [...pages(3), { kind: 'person', entityId: 'p1' }])
vi.mock('@/lib/follows/get-member-follows', () => ({ getMemberFollows: () => follows() }))
vi.mock('@/components/member/OwnPages', () => ({ OwnPages: () => null }))
vi.mock('@/components/auth/SignOutButton', () => ({ SignOutButton: () => null }))
vi.mock('next/navigation', () => ({ usePathname: () => '/you' }))

import YouPage from './page'

afterEach(cleanup)

describe('#962 — Following from You', () => {
  it('has a Following row above Your Pages that opens the Following page and says how many', async () => {
    render(await YouPage())
    const row = screen.getByTestId('you-following-row')
    expect(row).toHaveAttribute('href', '/you/following')
    expect(row).toHaveTextContent('Following')
    expect(row).toHaveTextContent('3 Pages')
    expect(row.compareDocumentPosition(screen.getByTestId('your-pages-section')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('reads naturally for one, and for none', async () => {
    follows.mockResolvedValueOnce(pages(1))
    render(await YouPage())
    expect(screen.getByTestId('you-following-row')).toHaveTextContent('1 Page')
    cleanup()
    follows.mockResolvedValueOnce([])
    render(await YouPage())
    expect(screen.getByTestId('you-following-row')).toHaveTextContent(/None yet/)
  })
})

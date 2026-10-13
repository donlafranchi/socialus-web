import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// F082 criterion 7 — the rules are one tap away, whether or not the member is publishing.
// On a phone the footer is hidden (#296), so You → Settings is where a member finds them.

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
vi.mock('next/navigation', () => ({ usePathname: () => '/explore' }))

import YouPage from './page'
import { SiteFooter } from '@/components/shell/SiteFooter'
import { BeforeYouPublish } from '@/components/create/BeforeYouPublish'

afterEach(cleanup)

describe('F082.7 — the rules from You', () => {
  it('has a Rules row in Settings that goes straight to /rules', async () => {
    render(await YouPage())
    const row = screen.getByTestId('settings-rules')
    const link = row.querySelector('a')
    expect(link).toHaveAttribute('href', '/rules')
    expect(link).toHaveTextContent(/read/i)
  })

  it('keeps the link to a tappable size, like its neighbours', async () => {
    render(await YouPage())
    expect(screen.getByTestId('settings-rules').querySelector('a')).toHaveClass('min-h-tap')
  })

  // [guards F082.7]
  it('the rules are one tap from the Publish card, from You on a phone, and from the footer on a laptop', async () => {
    const hrefs = async (ui: React.ReactElement) => {
      render(ui)
      const found = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'))
      cleanup()
      return found
    }
    const publish = await hrefs(
      <BeforeYouPublish editPath="/g/x/edit" hasName hasPlace hasDescription hasTags hasPhoto onPublish={vi.fn()} />,
    )
    const you = await hrefs(await YouPage())
    const footer = await hrefs(<SiteFooter />)
    expect({ publish: publish.includes('/rules'), you: you.includes('/rules'), footer: footer.includes('/rules') }).toEqual({
      publish: true,
      you: true,
      footer: true,
    })
  })
})

// Nav CTA — "List your business" must not show to Members who already run a Shop.
// Trace: planning/backlog/audit-vendor-market-retirement.md § 1.3

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AuthCtaButtons } from './AuthCtaButtons'
import type { SupabaseClient } from '@supabase/supabase-js'

const UID = '00000000-0000-0000-0000-000000000001'

type MembershipResponse = { data: unknown; error: { message: string } | null }

function factoryFor(opts: {
  user: { id: string } | null
  memberships?: MembershipResponse
}) {
  const chain: Record<string, unknown> = {}
  const passthrough = () => chain
  for (const m of ['select', 'eq', 'is', 'limit']) chain[m] = passthrough
  chain.then = (f: (v: unknown) => unknown) =>
    Promise.resolve(opts.memberships ?? { data: [], error: null }).then(f)

  const client = {
    from: vi.fn(() => chain),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: opts.user } })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  }
  return () => client as unknown as SupabaseClient
}

const listLink = () => screen.queryByRole('link', { name: /list your business/i })

afterEach(cleanup)

describe('AuthCtaButtons — signed-in seller suppression', () => {
  it('hides the CTA from a Member who already runs an active Shop', async () => {
    render(
      <AuthCtaButtons
        supabaseFactory={factoryFor({
          user: { id: UID },
          memberships: { data: [{ group_id: 'g1' }], error: null },
        })}
      />,
    )
    await waitFor(() => expect(screen.queryByTestId('signup-link')).not.toBeInTheDocument())
    expect(listLink()).not.toBeInTheDocument()
  })

  it('shows the CTA to a signed-in Member with no Shop', async () => {
    render(
      <AuthCtaButtons
        supabaseFactory={factoryFor({
          user: { id: UID },
          memberships: { data: [], error: null },
        })}
      />,
    )
    await waitFor(() => expect(listLink()).toBeInTheDocument())
  })

  it('fails closed: hides the CTA when the seller lookup errors', async () => {
    render(
      <AuthCtaButtons
        supabaseFactory={factoryFor({
          user: { id: UID },
          memberships: { data: null, error: { message: 'boom' } },
        })}
      />,
    )
    // Give the lookup a chance to settle, then assert nothing appeared.
    await waitFor(() => expect(screen.queryByTestId('signup-link')).not.toBeInTheDocument())
    await new Promise((r) => setTimeout(r, 20))
    expect(listLink()).not.toBeInTheDocument()
  })

  it('does not show the CTA before the seller lookup resolves', () => {
    render(
      <AuthCtaButtons
        supabaseFactory={factoryFor({
          user: { id: UID },
          memberships: { data: [], error: null },
        })}
      />,
    )
    expect(listLink()).not.toBeInTheDocument()
  })

  it('still renders the signed-out CTAs', async () => {
    render(<AuthCtaButtons supabaseFactory={factoryFor({ user: null })} />)
    await waitFor(() => expect(screen.getByTestId('signup-link')).toBeInTheDocument())
    expect(listLink()).toBeInTheDocument()
  })

  it('never reads the retired businesses table', async () => {
    const factory = factoryFor({ user: { id: UID }, memberships: { data: [], error: null } })
    const client = factory() as unknown as { from: ReturnType<typeof vi.fn> }
    render(<AuthCtaButtons supabaseFactory={() => client as unknown as SupabaseClient} />)
    await waitFor(() => expect(listLink()).toBeInTheDocument())
    expect(client.from.mock.calls.flat()).not.toContain('businesses')
    expect(client.from.mock.calls.flat()).toContain('group_memberships')
  })
})

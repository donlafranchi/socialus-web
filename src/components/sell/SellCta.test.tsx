// T073 — Unit tests for <SellCta>.
// Trace: T073 § Acceptance Criteria — /you Sell CTA wiring (3-branch routing).

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { labelFor, SellCta } from './SellCta'

const pushSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn() }),
}))

// Mock the server-action module so the CTA can mount without a real DB.
vi.mock('@/app/you/sell/actions', () => ({
  sellCreateDraftAction: vi.fn(),
  sellUpdateDraftAction: vi.fn(),
  sellActivateAction: vi.fn(),
}))
// Issue #180 — the Location actions live in their own module now.
vi.mock('@/app/_actions/location-actions', () => ({
  createLocationAction: vi.fn(),
  searchPlacesAction: vi.fn(async () => ({ ok: true, data: [] })),
  listNeighborhoodsAction: vi.fn(async () => []),
}))

afterEach(() => {
  pushSpy.mockClear()
  cleanup()
})

function makeSupabaseStub(responses: {
  group_memberships?: unknown[]
  groups?: unknown[]
  locations?: unknown[]
}) {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {}
    const passthrough = () => chain
    chain.select = passthrough
    chain.eq = passthrough
    chain.in = passthrough
    chain.is = passthrough
    chain.order = passthrough
    chain.limit = passthrough
    chain.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({
        data: responses[table as keyof typeof responses] ?? [],
        error: null,
      }).then(onFulfilled)
    return chain
  }
  return () =>
    ({
      from: vi.fn((table: string) => builder(table)),
      rpc: vi.fn((fn: string) =>
        Promise.resolve({
          data:
            fn === 'current_member_founded_group_ids'
              ? ((responses.groups ?? []) as { id: string }[]).map((g) => g.id)
              : (responses.locations ?? []),
          error: null,
        }),
      ),
    }) as unknown as ReturnType<
      typeof import('@supabase/ssr').createBrowserClient
    >
}

describe('labelFor', () => {
  it('returns "Sell" when nothing is resolved', () => {
    expect(labelFor(null)).toBe('Sell')
  })
  it('returns "Sell" for active-business-Group owner (route to /you/sell)', () => {
    expect(
      labelFor({ draftGroup: null, hasActiveBusinessGroup: true }),
    ).toBe('Sell')
  })
  it('returns "Continue setting up your Page" when a draft is in flight', () => {
    expect(
      labelFor({
        draftGroup: {
          groupId: 'g',
          brandName: 'X',
          anchorLocationId: null,
          publicDescription: null,
          resumeFromStep: 1,
        },
        hasActiveBusinessGroup: false,
      }),
    ).toBe('Continue setting up your Page')
  })
  it('returns "Sell" for first-time Seller', () => {
    expect(
      labelFor({ draftGroup: null, hasActiveBusinessGroup: false }),
    ).toBe('Sell')
  })
})

describe('SellCta — render branches', () => {
  it('renders nothing when there is no signed-in Member', () => {
    const { container } = render(
      <SellCta memberId={null} supabaseFactory={makeSupabaseStub({})} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the "Sell" CTA for a first-time Seller', async () => {
    render(
      <SellCta
        memberId="m1"
        supabaseFactory={makeSupabaseStub({})}
        initialLocations={[]}
      />,
    )
    await waitFor(() => {
      const cta = screen.getByTestId('you-sell-cta')
      expect(cta).toHaveTextContent(/^Sell$/)
      expect(cta).toHaveAttribute('data-cta-state', 'fresh')
    })
  })

  it('shows "Continue setting up your Page" when a draft exists', async () => {
    render(
      <SellCta
        memberId="m1"
        supabaseFactory={makeSupabaseStub({
          groups: [
            {
              id: 'g-draft',
              name: 'Oak Park Sourdough',
              anchor_location_id: 'loc-1',
              group_businesses: [
                {
                  display_name: 'Oak Park Sourdough',
                  public_description: null,
                },
              ],
            },
          ],
        })}
        initialLocations={[]}
      />,
    )
    await waitFor(() => {
      const cta = screen.getByTestId('you-sell-cta')
      expect(cta).toHaveTextContent(/Continue setting up your Page/i)
      expect(cta).toHaveAttribute('data-cta-state', 'resume')
    })
  })

  it('routes to /you/sell when an active business Group is owned', async () => {
    render(
      <SellCta
        memberId="m1"
        supabaseFactory={makeSupabaseStub({
          group_memberships: [
            {
              group_id: 'g',
              groups: { kind: 'business', lifecycle_state: 'active' },
            },
          ],
        })}
        initialLocations={[]}
      />,
    )
    const cta = await screen.findByTestId('you-sell-cta')
    expect(cta).toHaveAttribute('data-cta-state', 'active')
    fireEvent.click(cta)
    expect(pushSpy).toHaveBeenCalledWith('/you/sell')
  })

  it('falls back to fresh-Seller branch on lookup error (CTA still visible)', async () => {
    const errorFactory = () =>
      ({
        from: () => {
          const chain: Record<string, unknown> = {}
          const passthrough = () => chain
          chain.select = passthrough
          chain.eq = passthrough
          chain.in = passthrough
          chain.is = passthrough
          chain.order = passthrough
          chain.limit = passthrough
          chain.then = (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve({
              data: null,
              error: { message: 'rls denied' },
            }).then(onFulfilled)
          return chain
        },
      }) as unknown as ReturnType<
        typeof import('@supabase/ssr').createBrowserClient
      >
    render(
      <SellCta
        memberId="m1"
        supabaseFactory={errorFactory}
        initialLocations={[]}
      />,
    )
    await waitFor(() => {
      const cta = screen.getByTestId('you-sell-cta')
      expect(cta).toHaveTextContent(/^Sell$/)
      expect(cta).toHaveAttribute('data-cta-state', 'fresh')
    })
  })

  // #246 — locations.member_id is readable by nobody, so the member's own
  // saved Locations come from own_locations(), which reads it as its owner.
  it("loads the member's saved Locations without reading locations.member_id", async () => {
    const stub = makeSupabaseStub({})()
    const rpc = vi.fn(() => Promise.resolve({ data: [{ id: 'l1', label: 'B246 Hall' }], error: null }))
    const factory = () => ({ ...stub, rpc }) as unknown as typeof stub
    const { container } = render(<SellCta memberId="m1" supabaseFactory={factory} />)
    await waitFor(() => {
      expect(container.querySelector('[data-testid="you-sell-cta"]')).not.toBeNull()
    })
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('own_locations'))
    expect((stub.from as ReturnType<typeof vi.fn>).mock.calls.map(([t]) => t)).not.toContain('locations')
  })

  it('opens the walkthrough on fresh-Seller CTA click', async () => {
    render(
      <SellCta
        memberId="m1"
        supabaseFactory={makeSupabaseStub({})}
        initialLocations={[]}
      />,
    )
    const cta = await screen.findByTestId('you-sell-cta')
    fireEvent.click(cta)
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /What are we creating\?/i }),
      ).toBeInTheDocument()
    })
  })
})

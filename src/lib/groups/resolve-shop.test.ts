// T074 — Unit tests for the public Shop resolver (F035 read surface).
// Trace: planning/now/scenario-F035-rosa-finds-mayas-shop.md
//        development/tickets/T074-shop-public-page.md

import { describe, it, expect, vi, beforeEach } from 'vitest'

// T143/T144 — resolveShop now calls two pg-backed resolvers (placement,
// category free text). Mocked so this file stays a pure unit test of the
// Supabase-client read path, not an integration test against a live pool.
const { resolvePagePlacements } = vi.hoisted(() => ({
  resolvePagePlacements: vi.fn(),
}))
vi.mock('./resolve-page-placement', () => ({ resolvePagePlacements }))

import {
  splitGroupSlug,
  resolveShop,
  resolveLocalOwnerBadge,
  resolveOwnerClaim,
} from './resolve-shop'

beforeEach(() => {
  resolvePagePlacements.mockReset()
  resolvePagePlacements.mockResolvedValue([])
})

describe('splitGroupSlug', () => {
  it('returns null when there is no /g/ marker (bare place path)', () => {
    expect(splitGroupSlug(['ca', 'sacramento', 'oak-park'])).toBeNull()
  })

  it('splits a place path and the group slug at the /g/ marker', () => {
    expect(
      splitGroupSlug(['ca', 'sacramento', 'oak-park', 'g', 'oak-park-sourdough']),
    ).toEqual({
      placeSegments: ['ca', 'sacramento', 'oak-park'],
      groupSlug: 'oak-park-sourdough',
    })
  })

  it('returns null when /g/ is present but no slug follows it', () => {
    expect(splitGroupSlug(['ca', 'sacramento', 'g'])).toBeNull()
  })

  it('handles a group directly under a top-level place', () => {
    expect(splitGroupSlug(['ca', 'g', 'statewide-shop'])).toEqual({
      placeSegments: ['ca'],
      groupSlug: 'statewide-shop',
    })
  })
})

// Supabase client stub: switches the chainable builder by table name so we can
// stub two queries (groups + member_public_has_published) in one test.
// T095 — added discoverability route.
function makeSupabaseStub(routes: {
  group?: unknown
  groupError?: unknown
  /** #241 — the row rpc('page_founder_public') returns, or null for none. */
  founder?: unknown
  selects?: string[]
  /** F093.8 — what asking for the anchor as the caller returns; signed out it is refused. */
  anchorError?: unknown
}) {
  return {
    rpc: (name: string) =>
      Promise.resolve({
        data: name === 'page_founder_public' && routes.founder ? [routes.founder] : [],
        error: null,
      }),
    from: () => {
      const chain: Record<string, unknown> = {}
      const passthrough = () => chain
      let cols = ''
      chain.select = (c: string) => {
        cols = c
        routes.selects?.push(c)
        return chain
      }
      chain.eq = passthrough
      chain.is = passthrough
      chain.limit = passthrough
      chain.maybeSingle = () =>
        cols === 'anchor_location_id'
          ? Promise.resolve(
              routes.anchorError
                ? { data: null, error: routes.anchorError }
                : { data: { anchor_location_id: (routes.group as { anchor_location_id?: string } | null)?.anchor_location_id ?? null }, error: null },
            )
          : Promise.resolve({ data: routes.group ?? null, error: routes.groupError ?? null })
      return chain
    },
  } as unknown as Parameters<typeof resolveShop>[0]
}

const FOUNDER = { handle: 'maya', display_name: 'Maya Rivera', avatar_url: 'https://x/a.png', has_published: false }

const ACTIVE_ROW = {
  id: 'grp-1',
  slug: 'oak-park-sourdough',
  kind: 'business',
  lifecycle_state: 'active',
  anchor_location_id: 'loc-1',
  category: null as string | null,
  group_businesses: [
    { display_name: 'Oak Park Sourdough', public_description: 'Real bread, baked local.' },
  ],
}

// F093 criterion 8 (amended 2026-09-30): where a Page is never reaches a
// signed-out caller. The anchor is asked for as the caller, whom the database
// refuses when signed out, and the address is resolved only when it answered.
describe('resolveShop — where the Page is', () => {
  it('never asks for the anchor in the read that finds the Page', async () => {
    const selects: string[] = []
    await resolveShop(makeSupabaseStub({ group: ACTIVE_ROW, selects }), 'oak-park-sourdough')
    expect(selects[0]).not.toContain('anchor_location_id')
  })

  it('signed out, carries no anchor and resolves no address', async () => {
    const shop = await resolveShop(
      makeSupabaseStub({ group: ACTIVE_ROW, anchorError: { message: 'permission denied' } }),
      'oak-park-sourdough',
    )
    expect(shop).not.toBeNull()
    expect(shop!.anchorLocationId).toBeNull()
    expect(shop!.placements).toEqual([])
    expect(resolvePagePlacements).not.toHaveBeenCalled()
  })

  it('signed in, carries the anchor and its address', async () => {
    const shop = await resolveShop(makeSupabaseStub({ group: ACTIVE_ROW }), 'oak-park-sourdough')
    expect(shop!.anchorLocationId).toBe('loc-1')
    expect(resolvePagePlacements).toHaveBeenCalledWith('grp-1')
  })
})

describe('resolveShop', () => {
  it('carries an operator removal, so no surface shows a removed photo', async () => {
    const shop = await resolveShop(
      makeSupabaseStub({ group: { ...ACTIVE_ROW, photo_url: 'https://x/p.jpg', photo_removed_at: '2026-10-02T00:00:00Z' } }),
      'oak-park-sourdough',
    )
    expect(shop?.photoRemovedAt).toBe('2026-10-02T00:00:00Z')
  })

  it('returns null when RLS yields no row (draft-to-non-owner, dissolved, nonexistent)', async () => {
    const shop = await resolveShop(makeSupabaseStub({ group: null }), 'whatever')
    expect(shop).toBeNull()
  })

  it('returns null on a query error rather than throwing', async () => {
    const shop = await resolveShop(
      makeSupabaseStub({ group: null, groupError: { message: 'boom' } }),
      'x',
    )
    expect(shop).toBeNull()
  })


  it('T143 — carries the resolved placements through from resolvePagePlacements', async () => {
    resolvePagePlacements.mockResolvedValueOnce([
      { source: 'anchor', kind: 'point', label: '123 Main St, Sacramento, CA', lng: -121.5, lat: 38.58 },
    ])
    const shop = await resolveShop(
      makeSupabaseStub({ group: ACTIVE_ROW, founder: FOUNDER }),
      'oak-park-sourdough',
    )
    expect(resolvePagePlacements).toHaveBeenCalledWith('grp-1')
    expect(shop?.placements).toEqual([
      { source: 'anchor', kind: 'point', label: '123 Main St, Sacramento, CA', lng: -121.5, lat: 38.58 },
    ])
  })



  it('surfaces founder hasPublished=true when the projection carries them', async () => {
    const shop = await resolveShop(
      makeSupabaseStub({ group: ACTIVE_ROW, founder: { ...FOUNDER, has_published: true } }),
      'oak-park-sourdough',
    )
    expect(shop?.founder?.hasPublished).toBe(true)
  })

  it('flags a draft row so the page can render the owner preview', async () => {
    const shop = await resolveShop(
      makeSupabaseStub({
        group: { ...ACTIVE_ROW, lifecycle_state: 'draft' },
        founder: FOUNDER,
      }),
      'oak-park-sourdough',
    )
    expect(shop?.lifecycleState).toBe('draft')
  })

  it('tolerates PostgREST returning the embeds as single objects', async () => {
    const shop = await resolveShop(
      makeSupabaseStub({
        group: {
          ...ACTIVE_ROW,
          group_businesses: { display_name: 'Solo Object Shop', public_description: '' },
        },
        founder: { ...FOUNDER, avatar_url: null },
      }),
      'oak-park-sourdough',
    )
    expect(shop?.displayName).toBe('Solo Object Shop')
    expect(shop?.founder?.avatarUrl).toBeNull()
    expect(shop?.founder?.hasPublished).toBe(false)
  })

  it('returns a null founder gracefully when there is none to show', async () => {
    const shop = await resolveShop(makeSupabaseStub({ group: ACTIVE_ROW, founder: null }), 'oak-park-sourdough')
    expect(shop?.founder).toBeNull()
  })

  // #241 — a stranger may not read groups.founder_member_id, and asking for it
  // (or embedding through it) fails the whole read, which 404s the Page.
  it('never asks groups for who founded it', async () => {
    const selects: string[] = []
    await resolveShop(makeSupabaseStub({ group: ACTIVE_ROW, founder: FOUNDER, selects }), 'oak-park-sourdough')
    expect(selects.join(' ')).not.toMatch(/founder/)
  })

  it('names the founder from page_founder_public', async () => {
    const shop = await resolveShop(makeSupabaseStub({ group: ACTIVE_ROW, founder: FOUNDER }), 'oak-park-sourdough')
    expect(shop?.founder).toEqual({ handle: 'maya', displayName: 'Maya Rivera', avatarUrl: 'https://x/a.png', hasPublished: false })
  })
})

// T096 — jurisdiction-aware stub. Routes by table; the jurisdiction list query
// (`.select('zip').eq(...).is(...)`) terminates on an awaited (thenable) chain,
// while membership / single-jurisdiction reads terminate on `.maybeSingle()`.
// `.rpc('zip_is_proximal_to_location', { zip, location_id })` resolves true when
// the ZIP is in `proximalZips`.
function makeJurisdictionStub(opts: {
  activeRows?: { zip: string }[]
  ownerMembership?: { role: string } | null
  ownerRow?: { zip: string } | null
  proximalZips?: string[]
}) {
  const proximal = new Set(opts.proximalZips ?? [])
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      const pass = () => chain
      chain.select = pass
      chain.eq = pass
      chain.is = pass
      chain.limit = pass
      chain.maybeSingle = () =>
        Promise.resolve(
          table === 'group_memberships'
            ? { data: opts.ownerMembership ?? null, error: null }
            : { data: opts.ownerRow ?? null, error: null },
        )
      // Awaited (list) terminal — used by the badge resolver.
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: opts.activeRows ?? [], error: null })
      return chain
    },
    rpc(_name: string, params: { zip: string; location_id: string }) {
      return Promise.resolve({ data: proximal.has(params.zip), error: null })
    },
  } as unknown as Parameters<typeof resolveLocalOwnerBadge>[0]
}

// #246 — the badge is page_local_owner_badge(), a boolean. The proximity test
// and the OR across registrations live in SQL (tests/registration-badge-db).
// The registration table is never read here: a stranger may not read it.
function makeBadgeStub(badge: boolean | null, error: unknown = null) {
  const calls: { name: string; params: unknown }[] = []
  const supabase = {
    from(table: string) {
      throw new Error(`reads ${table}; use page_local_owner_badge`)
    },
    rpc(name: string, params: unknown) {
      calls.push({ name, params })
      return Promise.resolve({ data: badge, error })
    },
  } as unknown as Parameters<typeof resolveLocalOwnerBadge>[0]
  return { supabase, calls }
}

describe('resolveLocalOwnerBadge', () => {
  it('returns the badge when page_local_owner_badge says so', async () => {
    const { supabase, calls } = makeBadgeStub(true)
    const badge = await resolveLocalOwnerBadge(supabase, { groupId: 'grp-1', anchorLocationId: 'loc-1' })
    expect(badge).toEqual({ label: 'Claimed local owner' })
    expect(calls).toEqual([{ name: 'page_local_owner_badge', params: { p_group_id: 'grp-1' } }])
  })

  it('returns null when it does not', async () => {
    const { supabase } = makeBadgeStub(false)
    expect(await resolveLocalOwnerBadge(supabase, { groupId: 'grp-1', anchorLocationId: 'loc-1' })).toBeNull()
  })

  it('returns null on an error — a missing answer never earns the badge', async () => {
    const { supabase } = makeBadgeStub(null, { message: 'boom' })
    expect(await resolveLocalOwnerBadge(supabase, { groupId: 'grp-1', anchorLocationId: 'loc-1' })).toBeNull()
  })

  it('returns null without asking when the anchor Location is null', async () => {
    const { supabase, calls } = makeBadgeStub(true)
    expect(await resolveLocalOwnerBadge(supabase, { groupId: 'grp-1', anchorLocationId: null })).toBeNull()
    expect(calls).toEqual([])
  })
})

describe('resolveOwnerClaim', () => {
  it('returns null for an anonymous viewer (no member id)', async () => {
    const claim = await resolveOwnerClaim(makeJurisdictionStub({}), {
      groupId: 'grp-1',
      anchorLocationId: 'loc-1',
      viewerMemberId: null,
    })
    expect(claim).toBeNull()
  })

  it('returns null when the viewer is not an active owner', async () => {
    const claim = await resolveOwnerClaim(
      makeJurisdictionStub({ ownerMembership: null }),
      { groupId: 'grp-1', anchorLocationId: 'loc-1', viewerMemberId: 'rosa' },
    )
    expect(claim).toBeNull()
  })

  it('returns an empty claim when the owner has no active jurisdiction row', async () => {
    const claim = await resolveOwnerClaim(
      makeJurisdictionStub({ ownerMembership: { role: 'owner' }, ownerRow: null }),
      { groupId: 'grp-1', anchorLocationId: 'loc-1', viewerMemberId: 'maya' },
    )
    expect(claim).toEqual({ zip: null, isProximal: false })
  })

  it('returns the owner ZIP with isProximal=true when it passes proximity', async () => {
    const claim = await resolveOwnerClaim(
      makeJurisdictionStub({
        ownerMembership: { role: 'owner' },
        ownerRow: { zip: '95817' },
        proximalZips: ['95817'],
      }),
      { groupId: 'grp-1', anchorLocationId: 'loc-1', viewerMemberId: 'maya' },
    )
    expect(claim).toEqual({ zip: '95817', isProximal: true })
  })

  it('returns the owner ZIP with isProximal=false for a non-proximal claim', async () => {
    const claim = await resolveOwnerClaim(
      makeJurisdictionStub({
        ownerMembership: { role: 'owner' },
        ownerRow: { zip: '90210' },
        proximalZips: ['95817'],
      }),
      { groupId: 'grp-1', anchorLocationId: 'loc-1', viewerMemberId: 'maya' },
    )
    expect(claim).toEqual({ zip: '90210', isProximal: false })
  })
})

// T156 — the Page kind is a parameter, not a constant.
//
// This resolver filtered `kind = 'business'` and so 404'd every other kind of
// Page: a run club, an interest Page, a practice. Whether SocialUs has two
// Page kinds or three is Don's and unruled, so the filter becomes an argument
// the caller supplies and the decision lands without a second rewrite.
function makeRecordingStub(row: unknown) {
  const calls = { eq: [] as [string, unknown][], in: [] as [string, unknown][] }
  const supabase = {
    rpc: () => Promise.resolve({ data: [], error: null }),
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = (c: string, v: unknown) => {
        calls.eq.push([c, v])
        return chain
      }
      chain.in = (c: string, v: unknown) => {
        calls.in.push([c, v])
        return chain
      }
      chain.is = () => chain
      chain.limit = () => chain
      chain.maybeSingle = () =>
        Promise.resolve({
          data: table === 'member_public_has_published' ? null : row,
          error: null,
        })
      return chain
    },
  } as unknown as Parameters<typeof resolveShop>[0]
  return { supabase, calls }
}

const RUN_CLUB_ROW = {
  id: 'grp-2',
  slug: 'sacriver-floaters',
  kind: 'interest',
  name: 'SacRiver Floaters',
  description: 'We float the river on Sundays.',
  lifecycle_state: 'active',
  anchor_location_id: 'loc-2',
  category: null as string | null,
  // A non-business Page has no group_businesses child, and never will.
  group_businesses: null,
}

describe('T156 — resolveShop takes the Page kind as a parameter', () => {
  it('applies no kind predicate by default, so any Page kind resolves', async () => {
    const { supabase, calls } = makeRecordingStub(RUN_CLUB_ROW)
    const shop = await resolveShop(supabase, 'sacriver-floaters')
    expect(shop?.groupId).toBe('grp-2')
    expect(calls.eq).toContainEqual(['slug', 'sacriver-floaters'])
    expect(calls.eq.map(([c]) => c)).not.toContain('kind')
    expect(calls.in.map(([c]) => c)).not.toContain('kind')
  })

  it('narrows to the kinds a caller asks for', async () => {
    const { supabase, calls } = makeRecordingStub(ACTIVE_ROW)
    await resolveShop(supabase, 'oak-park-sourdough', { kinds: ['business'] })
    expect(calls.in).toContainEqual(['kind', ['business']])
  })

  it('an empty kind list is treated as no filter, never as "match nothing"', async () => {
    const { supabase, calls } = makeRecordingStub(RUN_CLUB_ROW)
    const shop = await resolveShop(supabase, 'sacriver-floaters', { kinds: [] })
    expect(shop?.groupId).toBe('grp-2')
    expect(calls.in.map(([c]) => c)).not.toContain('kind')
  })

  // Resolving the Page and then rendering it blank is not a fix. A non-business
  // Page's name and description live on `groups`; only a business keeps them in
  // the `group_businesses` child.
  it('a non-business Page carries its own name and description', async () => {
    const { supabase } = makeRecordingStub(RUN_CLUB_ROW)
    const shop = await resolveShop(supabase, 'sacriver-floaters')
    expect(shop?.displayName).toBe('SacRiver Floaters')
    expect(shop?.publicDescription).toBe('We float the river on Sundays.')
    expect(shop?.kind).toBe('interest')
  })

  it('a business still prefers its group_businesses name over the groups row', async () => {
    const { supabase } = makeRecordingStub({
      ...ACTIVE_ROW,
      name: 'oak-park-sourdough-llc',
      description: 'internal',
    })
    const shop = await resolveShop(supabase, 'oak-park-sourdough')
    expect(shop?.displayName).toBe('Oak Park Sourdough')
    expect(shop?.publicDescription).toBe('Real bread, baked local.')
  })
})

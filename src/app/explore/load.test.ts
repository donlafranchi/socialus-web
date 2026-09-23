// T169 (#203) — F059 criteria 2b and 2c.
//
// 2c is the one these tests are really for: "the signed-in half is withheld
// SERVER-SIDE, never rendered and hidden." That is a claim about what leaves
// the server, so it is asserted on the calls `loadBrowse` makes, not on what a
// component chooses to paint.
//
// The distinction that matters, and the one an optimisation would erase:
//   - signed OUT — the second call is never made. There is no member, so there
//     is no set, and nothing reaches the browser to hide.
//   - signed in with NO follows — the call IS made, and the SQL predicate
//     returns nothing. Withholding stays in the query. Short-circuiting this
//     case would move the rule into TypeScript, where the next person can
//     change it without noticing they have.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  getUser,
  from,
  rpc,
  getBrowseFeed,
  resolveFollowedPageIds,
  listFeedMetros,
  waitingCountByMetro,
  resolveBrowseScope,
} =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    from: vi.fn(),
    rpc: vi.fn(),
    getBrowseFeed: vi.fn(),
    resolveFollowedPageIds: vi.fn(),
    listFeedMetros: vi.fn(),
    waitingCountByMetro: vi.fn(),
    resolveBrowseScope: vi.fn(),
  }))

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, from, rpc })),
}))
vi.mock('@/lib/feed/browse-feed', () => ({ getBrowseFeed }))
vi.mock('@/lib/feed/followed-pages', () => ({ resolveFollowedPageIds }))
vi.mock('@/lib/feed/feed-metro', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/feed/feed-metro')>()
  // `withWaitingCounts` stays real — it is a pure merge, and stubbing it would
  // hide the thing worth checking: that the cached counts reach the picker.
  return { ...actual, listFeedMetros }
})
vi.mock('@/lib/metro/waitlist-counts', () => ({ waitingCountByMetro }))
vi.mock('@/lib/browse/scope', () => ({ resolveBrowseScope }))

import { loadBrowse } from './load'

const MEMBER = '11111111-1111-1111-1111-111111111111'
const METRO = { id: 'm-1', slug: 'sacramento-roseville-ca', name: 'Sacramento-Roseville, CA', isOpen: true }

const publicRow = { id: 'r-public', name: 'A Page' }
const followedRow = { id: 'r-followed', name: 'An announcement' }

const signedIn = () => getUser.mockResolvedValue({ data: { user: { id: MEMBER } } })
const signedOut = () => getUser.mockResolvedValue({ data: { user: null } })

/** Calls carrying the personal audience. */
const followingCalls = () =>
  getBrowseFeed.mock.calls.filter(([, opts]) => opts?.audience?.audience === 'following')

beforeEach(() => {
  vi.clearAllMocks()
  listFeedMetros.mockResolvedValue([METRO])
  waitingCountByMetro.mockResolvedValue(new Map([[METRO.id, 12]]))
  resolveBrowseScope.mockResolvedValue({ metro: METRO, chosen: false })
  resolveFollowedPageIds.mockResolvedValue([])
  from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { home_metro_id: null } }) }) }),
  })
  getBrowseFeed.mockImplementation(async (_c: unknown, opts: { audience?: { audience: string } }) =>
    opts?.audience?.audience === 'following' ? [followedRow] : [publicRow],
  )
})

describe('signed out — criterion 2b, the personal half is absent', () => {
  it('never asks for it at all', async () => {
    signedOut()
    const snap = await loadBrowse(null)
    // Not "asks and discards" — does not ask.
    expect(followingCalls()).toHaveLength(0)
    expect(getBrowseFeed).toHaveBeenCalledTimes(1)
    expect(snap.following).toEqual([])
  })

  it('does not even resolve a follow set', async () => {
    signedOut()
    await loadBrowse(null)
    expect(resolveFollowedPageIds).not.toHaveBeenCalled()
  })

  it('leaves the public half exactly as it was', async () => {
    signedOut()
    const snap = await loadBrowse(null)
    expect(snap.results).toEqual([publicRow])
  })
})

describe('signed in — criterion 2b, Browse carries what is theirs', () => {
  it('asks for the personal half with exactly the followed ids', async () => {
    signedIn()
    resolveFollowedPageIds.mockResolvedValue(['g-1', 'g-2'])
    const snap = await loadBrowse(null)

    const calls = followingCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]![1].audience).toEqual({ audience: 'following', following: ['g-1', 'g-2'] })
    expect(snap.following).toEqual([followedRow])
  })

  it('scopes the personal half to the same metro as the public half', async () => {
    signedIn()
    resolveFollowedPageIds.mockResolvedValue(['g-1'])
    await loadBrowse(null)
    for (const [, opts] of getBrowseFeed.mock.calls) {
      expect(opts.scope).toEqual({ metroId: METRO.id })
    }
  })

  it('leaves the public half identical to what a signed-out reader gets', async () => {
    signedOut()
    const out = await loadBrowse(null)
    vi.clearAllMocks()
    listFeedMetros.mockResolvedValue([METRO])
  waitingCountByMetro.mockResolvedValue(new Map([[METRO.id, 12]]))
    resolveBrowseScope.mockResolvedValue({ metro: METRO, chosen: false })
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { home_metro_id: null } }) }) }),
    })
    getBrowseFeed.mockImplementation(async (_c: unknown, opts: { audience?: { audience: string } }) =>
      opts?.audience?.audience === 'following' ? [followedRow] : [publicRow],
    )
    signedIn()
    resolveFollowedPageIds.mockResolvedValue(['g-1'])
    const inn = await loadBrowse(null)

    // The personal half is ADDITIVE. It must not reorder, filter or extend the
    // thing every reader sees.
    expect(inn.results).toEqual(out.results)
  })
})

describe('signed in with no follows — criterion 2c stays in the query', () => {
  it('still makes the call, rather than deciding the answer in TypeScript', async () => {
    signedIn()
    resolveFollowedPageIds.mockResolvedValue([])
    getBrowseFeed.mockImplementation(async (_c: unknown, opts: { audience?: { audience: string } }) =>
      opts?.audience?.audience === 'following' ? [] : [publicRow],
    )
    const snap = await loadBrowse(null)

    const calls = followingCalls()
    expect(calls).toHaveLength(1)
    // An empty set, handed to SQL whose predicate matches nothing against it.
    expect(calls[0]![1].audience).toEqual({ audience: 'following', following: [] })
    expect(snap.following).toEqual([])
  })
})

describe('failure', () => {
  it('a failed personal read costs the row, not the surface', async () => {
    signedIn()
    resolveFollowedPageIds.mockResolvedValue(['g-1'])
    getBrowseFeed.mockImplementation(async (_c: unknown, opts: { audience?: { audience: string } }) => {
      if (opts?.audience?.audience === 'following') throw new Error('boom')
      return [publicRow]
    })
    const snap = await loadBrowse(null)
    expect(snap.results).toEqual([publicRow])
    expect(snap.following).toEqual([])
    expect(snap.failed).toBe(false)
  })

  it('a failed follow-set read costs the row, not the surface', async () => {
    signedIn()
    resolveFollowedPageIds.mockRejectedValue(new Error('nope'))
    const snap = await loadBrowse(null)
    expect(snap.results).toEqual([publicRow])
    expect(snap.following).toEqual([])
  })

  it('no scope means no personal half either', async () => {
    signedIn()
    resolveBrowseScope.mockResolvedValue(null)
    const snap = await loadBrowse(null)
    expect(snap.following).toEqual([])
    expect(getBrowseFeed).not.toHaveBeenCalled()
  })
})

// F076 — the cached count reaches the picker, which is what the ordering needs.
describe('the waiting counts the picker sorts by', () => {
  it('merges the cached figure onto the metros', async () => {
    signedOut()
    const snap = await loadBrowse(null)
    expect(snap.metros[0]!.waiting).toBe(12)
  })

  it('costs the ordering and never the picker when the cache read fails', async () => {
    signedOut()
    waitingCountByMetro.mockRejectedValue(new Error('cache down'))
    const snap = await loadBrowse(null)
    expect(snap.metros).toHaveLength(1)
    expect(snap.metros[0]!.waiting).toBeUndefined()
    expect(snap.failed).toBe(false)
  })
})

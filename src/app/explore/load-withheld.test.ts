// F093 criteria 6 and 7 — what Explore asks for, signed out and signed in.
//
// A separate file from load.test.ts on purpose: that one is F059's, and its
// mocks are built to answer "is the personal half withheld". These assert a
// different claim on the same function, and folding them in would mean one
// `beforeEach` serving two scenarios and drifting for both.
//
// Asserted on the CALLS, not on what a component paints — same reason
// criterion 2c is asserted that way. Criterion 3 is about what leaves the
// server, and a card that declines to render is not that.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  getUser,
  from,
  rpc,
  getBrowseFeed,
  getWithheldAnnouncements,
  resolveFollowedPageIds,
  listFeedMetros,
  waitingCountByMetro,
  resolveBrowseScope,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  getBrowseFeed: vi.fn(),
  getWithheldAnnouncements: vi.fn(),
  resolveFollowedPageIds: vi.fn(),
  listFeedMetros: vi.fn(),
  waitingCountByMetro: vi.fn(),
  resolveBrowseScope: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, from, rpc })),
}))
vi.mock('@/lib/feed/browse-feed', () => ({ getBrowseFeed }))
vi.mock('@/lib/feed/withheld-announcements', () => ({ getWithheldAnnouncements }))
vi.mock('@/lib/feed/followed-pages', () => ({ resolveFollowedPageIds }))
// `withWaitingCounts` stays real — it is a pure merge, and these tests assert
// nothing about it; stubbing it away would only hide a change to it.
vi.mock('@/lib/feed/feed-metro', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/feed/feed-metro')>()
  return { ...actual, listFeedMetros }
})
// #216's cached waiting counts. Same reason as the withheld stub in
// load.test.ts: unmocked, the real one reaches for a server client that is not
// there, and the throw lands in a catch that makes these assertions vacuous.
vi.mock('@/lib/metro/waitlist-counts', () => ({ waitingCountByMetro }))
vi.mock('@/lib/browse/scope', () => ({ resolveBrowseScope }))

import { loadBrowse } from './load'

const MEMBER = '11111111-1111-1111-1111-111111111111'
const METRO = { id: 'm-1', slug: 'sacramento-roseville-ca', name: 'Sacramento-Roseville, CA', isOpen: true }

const pageRow = { resultKind: 'page', resultId: 'g-1', name: 'A Page', withheld: false }
const postRow = { resultKind: 'post', resultId: 'p-1', name: 'A Page', withheld: false, body: 'secret' }
const withheldRow = {
  resultKind: 'post',
  resultId: 'p-1',
  name: 'A Page',
  withheld: true,
  body: null,
  announcementCount: 3,
}

const signedIn = () => getUser.mockResolvedValue({ data: { user: { id: MEMBER } } })
const signedOut = () => getUser.mockResolvedValue({ data: { user: null } })

beforeEach(() => {
  vi.clearAllMocks()
  listFeedMetros.mockResolvedValue([METRO])
  resolveBrowseScope.mockResolvedValue({ metro: METRO, chosen: false })
  resolveFollowedPageIds.mockResolvedValue([])
  waitingCountByMetro.mockResolvedValue(new Map<string, number>())
  from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { home_metro_id: null } }) }) }),
  })
  getBrowseFeed.mockImplementation(
    async (_c: unknown, opts: { resultKinds?: string[] | null }) =>
      opts?.resultKinds?.includes('page') && opts.resultKinds.length === 1
        ? [pageRow]
        : [pageRow, postRow],
  )
  getWithheldAnnouncements.mockResolvedValue([withheldRow])
})

describe('signed out — criterion 7, the rows stay, in withheld form', () => {
  it('still carries post-kind rows', async () => {
    signedOut()
    const snap = await loadBrowse(null)
    // A Pages-only Explore fails this criterion even though it leaks nothing.
    expect(snap.results.some((r) => r.resultKind === 'post')).toBe(true)
  })

  it('carries them withheld, with no body on any of them', async () => {
    signedOut()
    const snap = await loadBrowse(null)
    const posts = snap.results.filter((r) => r.resultKind === 'post')
    expect(posts.every((r) => r.withheld)).toBe(true)
    expect(posts.every((r) => r.body === null)).toBe(true)
  })

  it('reads them from the withheld path', async () => {
    signedOut()
    await loadBrowse(null)
    expect(getWithheldAnnouncements).toHaveBeenCalledTimes(1)
  })

  it('asks browse_feed for Pages only, so one announcement cannot arrive twice', async () => {
    signedOut()
    await loadBrowse(null)
    expect(getBrowseFeed.mock.calls[0]![1]).toMatchObject({ resultKinds: ['page'] })
  })

  it('scopes the withheld read to the same metro', async () => {
    signedOut()
    await loadBrowse(null)
    expect(getWithheldAnnouncements.mock.calls[0]![1]).toMatchObject({
      scope: { metroId: METRO.id },
    })
  })

  it('asks for a period, so the count on the card means something', async () => {
    signedOut()
    await loadBrowse(null)
    const period = getWithheldAnnouncements.mock.calls[0]![1].period
    expect(typeof period.from).toBe('string')
    expect(typeof period.to).toBe('string')
    expect(new Date(period.to).getTime()).toBeGreaterThan(new Date(period.from).getTime())
  })

  it('keeps Browse when the withheld read fails, and says the read failed', async () => {
    // Same trade the public read makes: an empty surface that means "broken"
    // must not read as "nothing is happening here".
    signedOut()
    getWithheldAnnouncements.mockRejectedValue(new Error('boom'))
    const snap = await loadBrowse(null)
    expect(snap.failed).toBe(true)
    expect(snap.results.some((r) => r.resultKind === 'page')).toBe(true)
  })
})

describe('signed in — criterion 6, no change whatsoever', () => {
  it('never calls the withheld path', async () => {
    signedIn()
    await loadBrowse(null)
    expect(getWithheldAnnouncements).not.toHaveBeenCalled()
  })

  it('asks browse_feed for both kinds, as before', async () => {
    signedIn()
    await loadBrowse(null)
    expect(getBrowseFeed.mock.calls[0]![1].resultKinds ?? null).toBeNull()
  })

  it('still receives announcements with their bodies', async () => {
    signedIn()
    const snap = await loadBrowse(null)
    expect(snap.results.find((r) => r.resultKind === 'post')?.body).toBe('secret')
  })
})

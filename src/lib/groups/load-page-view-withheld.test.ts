// F093 criterion 9 — a signed-out visitor follows an announcement link and
// lands on a page that resolves.
//
// #212 gave an announcement card a fragment and the Page an anchor to match.
// Signed out, `page_posts` now returns nothing, so without this the Page would
// render no Announcements section at all and the fragment would scroll to
// nothing — the exact dead end #211 was about, reintroduced at a different
// door.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  getUser,
  resolveShopItems,
  resolvePagePosts,
  resolveLocalOwnerBadge,
  resolveOwnerClaim,
  viewerOwnsPage,
  viewerRelationship,
  countPageFollowers,
  getWithheldAnnouncements,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  resolveShopItems: vi.fn(),
  resolvePagePosts: vi.fn(),
  resolveLocalOwnerBadge: vi.fn(),
  resolveOwnerClaim: vi.fn(),
  viewerOwnsPage: vi.fn(),
  viewerRelationship: vi.fn(),
  countPageFollowers: vi.fn(),
  getWithheldAnnouncements: vi.fn(),
}))

vi.mock('./page-metadata', () => ({ resolvePageMetadata: async () => null }))
vi.mock('./resolve-shop', () => ({
  resolveShopItems,
  resolveLocalOwnerBadge,
  resolveOwnerClaim,
  viewerOwnsPage,
  viewerRelationship,
}))
vi.mock('./page-posts', () => ({ resolvePagePosts }))
vi.mock('@/lib/follows/follower-count', () => ({ countPageFollowers }))
vi.mock('@/lib/feed/withheld-announcements', () => ({ getWithheldAnnouncements }))

import { loadPageView } from './load-page-view'

const SHOP = { groupId: 'g-1', anchorLocationId: 'l-1', kind: 'interest' }
const withheldRow = { resultKind: 'post', resultId: 'p-1', withheld: true, announcementCount: 2 }
const realPost = { id: 'p-1', body: 'We are meeting Thursday', startsAt: null }

const supabase = { auth: { getUser } } as never

beforeEach(() => {
  vi.clearAllMocks()
  resolveShopItems.mockResolvedValue([])
  resolveLocalOwnerBadge.mockResolvedValue(null)
  resolveOwnerClaim.mockResolvedValue(null)
  viewerOwnsPage.mockResolvedValue(false)
  viewerRelationship.mockResolvedValue(null)
  countPageFollowers.mockResolvedValue(0)
  resolvePagePosts.mockResolvedValue([])
  getWithheldAnnouncements.mockResolvedValue([withheldRow])
})

describe('signed out', () => {
  beforeEach(() => getUser.mockResolvedValue({ data: { user: null } }))

  it('reads the withheld announcements for this Page', async () => {
    await loadPageView(supabase, SHOP as never)
    expect(getWithheldAnnouncements.mock.calls[0]![1]).toMatchObject({
      scope: { groupId: 'g-1' },
    })
  })

  it('hands them to the surface, so the anchor has something to land on', async () => {
    const view = await loadPageView(supabase, SHOP as never)
    expect(view.withheldPosts).toHaveLength(1)
  })

  it('carries no readable posts', async () => {
    // RLS already guarantees this; asserted so that a future read added here
    // without an auth test fails in the suite rather than in production.
    const view = await loadPageView(supabase, SHOP as never)
    expect(view.posts).toHaveLength(0)
  })

  it('keeps the Page when the withheld read fails', async () => {
    // A Page whose announcements cannot be read is still a Page — the rule
    // resolvePagePosts already follows.
    getWithheldAnnouncements.mockRejectedValue(new Error('boom'))
    const view = await loadPageView(supabase, SHOP as never)
    expect(view.withheldPosts).toEqual([])
  })
})

describe('signed in — criterion 6, no change whatsoever', () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: 'm-1' } } })
    resolvePagePosts.mockResolvedValue([realPost])
  })

  it('never reads the withheld path', async () => {
    await loadPageView(supabase, SHOP as never)
    expect(getWithheldAnnouncements).not.toHaveBeenCalled()
  })

  it('still gets the announcements with their bodies', async () => {
    const view = await loadPageView(supabase, SHOP as never)
    expect(view.posts[0]!.body).toBe('We are meeting Thursday')
    expect(view.withheldPosts).toEqual([])
  })
})

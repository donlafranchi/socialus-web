// #316 — a Page's tags reach signed-in visitors only.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, resolvePageTags } = vi.hoisted(() => ({ getUser: vi.fn(), resolvePageTags: vi.fn() }))
vi.mock('./page-metadata', () => ({ resolvePageMetadata: async () => null }))
vi.mock('./resolve-shop', () => ({
  resolveShopItems: vi.fn(async () => []),
  resolveLocalOwnerBadge: vi.fn(async () => null),
  resolveOwnerClaim: vi.fn(async () => null),
  viewerOwnsPage: vi.fn(async () => false),
  viewerRelationship: vi.fn(async () => null),
}))
vi.mock('./page-posts', () => ({ resolvePagePosts: vi.fn(async () => []) }))
vi.mock('@/lib/follows/follower-count', () => ({ countPageFollowers: vi.fn(async () => 0) }))
vi.mock('@/lib/feed/withheld-announcements', () => ({ getWithheldAnnouncements: vi.fn(async () => []) }))
vi.mock('./page-tags', () => ({ resolvePageTags }))

import { loadPageView } from './load-page-view'
const SHOP = { groupId: 'g-1', anchorLocationId: null, kind: 'business' }
const supabase = { auth: { getUser } } as never

beforeEach(() => {
  vi.clearAllMocks()
  resolvePageTags.mockResolvedValue(['Sourdough'])
})

describe('#316 — page tags', () => {
  it('signed in, carries them', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'm-1' } } })
    expect((await loadPageView(supabase, SHOP as never)).tags).toEqual(['Sourdough'])
  })
  it('signed out, carries none and never asks', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await loadPageView(supabase, SHOP as never)).tags).toEqual([])
    expect(resolvePageTags).not.toHaveBeenCalled()
  })
})

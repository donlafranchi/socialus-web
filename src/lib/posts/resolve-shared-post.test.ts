import { describe, it, expect, vi, beforeEach } from 'vitest'

// A shared post's address answers only what its reader could already read: a signed-in reader the post RLS returns,
// a signed-out one the withheld form (F093) when the post is one of the Page's visible ones, and anyone else nothing.

const { viewerId, resolvePagePosts, getWithheldAnnouncements } = vi.hoisted(() => ({
  viewerId: vi.fn(),
  resolvePagePosts: vi.fn(),
  getWithheldAnnouncements: vi.fn(),
}))
vi.mock('@/lib/auth/viewer', () => ({ viewerId }))
vi.mock('@/lib/groups/page-posts', () => ({ resolvePagePosts }))
vi.mock('@/lib/feed/withheld-announcements', () => ({ getWithheldAnnouncements }))

import { resolveSharedPost } from './resolve-shared-post'

const ID = '0b6c1e9a-4a3f-4f7e-9d6b-2c1a5e8f7d10'
const SHOP = { groupId: 'g-1' } as never
const db = {} as never

beforeEach(() => vi.clearAllMocks())

describe('resolveSharedPost', () => {
  it('is nothing for an id that is not a post id, without a read', async () => {
    expect(await resolveSharedPost(db, SHOP, 'edit')).toBeNull()
    expect(resolvePagePosts).not.toHaveBeenCalled()
    expect(getWithheldAnnouncements).not.toHaveBeenCalled()
  })

  it('signed in: the post as RLS returns it, asked for by id on its own Page', async () => {
    viewerId.mockResolvedValue('m-1')
    resolvePagePosts.mockResolvedValue([{ id: ID, body: 'x' }])
    expect(await resolveSharedPost(db, SHOP, ID)).toEqual({ access: 'full', post: { id: ID, body: 'x' } })
    expect(resolvePagePosts).toHaveBeenCalledWith(db, 'g-1', undefined, { postId: ID })
  })

  it('signed in: nothing when RLS returns nothing (a draft, unlisted or removed post, or another Page’s)', async () => {
    viewerId.mockResolvedValue('m-1')
    resolvePagePosts.mockResolvedValue([])
    expect(await resolveSharedPost(db, SHOP, ID)).toBeNull()
  })

  it('signed out: withheld when the post is one of the Page’s visible ones, and the words never read', async () => {
    viewerId.mockResolvedValue(null)
    getWithheldAnnouncements.mockResolvedValue([{ announcementIds: ['other', ID] }])
    expect(await resolveSharedPost(db, SHOP, ID)).toEqual({ access: 'withheld' })
    expect(getWithheldAnnouncements).toHaveBeenCalledWith(db, { scope: { groupId: 'g-1' } })
    expect(resolvePagePosts).not.toHaveBeenCalled()
  })

  it('signed out: nothing when the post is not one of them', async () => {
    viewerId.mockResolvedValue(null)
    getWithheldAnnouncements.mockResolvedValue([{ announcementIds: ['other'] }])
    expect(await resolveSharedPost(db, SHOP, ID)).toBeNull()
    getWithheldAnnouncements.mockResolvedValue([])
    expect(await resolveSharedPost(db, SHOP, ID)).toBeNull()
  })
})

// #293 — a Page's phone and hours reach signed-in visitors only.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, resolvePageContact } = vi.hoisted(() => ({ getUser: vi.fn(), resolvePageContact: vi.fn() }))

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
vi.mock('./page-contact', () => ({ resolvePageContact }))

import { loadPageView } from './load-page-view'

const SHOP = { groupId: 'g-1', anchorLocationId: null, kind: 'business' }
const supabase = { auth: { getUser } } as never
const CONTACT = { phone: '+19165550142', hours: { mon: [{ open: '07:00', close: '15:00' }] } }

beforeEach(() => {
  vi.clearAllMocks()
  resolvePageContact.mockResolvedValue(CONTACT)
})

describe('#293 — the contact block', () => {
  it('signed in, carries the phone and hours', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'm-1' } } })
    const view = await loadPageView(supabase, SHOP as never)
    expect(view.contact).toEqual(CONTACT)
  })

  it('signed out, carries neither and never asks', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const view = await loadPageView(supabase, SHOP as never)
    expect(view.contact).toBeNull()
    expect(resolvePageContact).not.toHaveBeenCalled()
  })
})

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
vi.mock('./page-contact', () => ({ resolvePageContact }))

import { loadPageView } from './load-page-view'

const SHOP = { groupId: 'g-1', anchorLocationId: null, kind: 'business' }
const supabase = { auth: { getUser, getClaims: async () => ({ data: (await getUser())?.data?.user ? { claims: { sub: (await getUser()).data.user.id } } : null, error: null }) } } as never
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

  // F134 — signed out asks too, but never for the phone (it is for members, 2026-10-07).
  it('signed out, asks without the phone', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await loadPageView(supabase, SHOP as never)
    expect(resolvePageContact).toHaveBeenCalledWith(expect.anything(), SHOP.groupId, false)
  })
})

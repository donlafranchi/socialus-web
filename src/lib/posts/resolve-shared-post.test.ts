import { describe, it, expect, vi, beforeEach } from 'vitest'

// A shared post's address answers only what its reader could already read: a signed-in reader the post RLS returns,
// a signed-out one the withheld form (F093) with the post's headline and lead line, and anyone else nothing.

const { viewerId, resolvePagePosts, rpc } = vi.hoisted(() => ({
  viewerId: vi.fn(),
  resolvePagePosts: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('@/lib/auth/viewer', () => ({ viewerId }))
vi.mock('@/lib/groups/page-posts', () => ({ resolvePagePosts }))

import { resolveSharedPost, resolvePostIdBySlug } from './resolve-shared-post'

const ID = '0b6c1e9a-4a3f-4f7e-9d6b-2c1a5e8f7d10'
const SHOP = { groupId: 'g-1' } as never
const db = {} as never
const dbRpc = { rpc } as never
const ROW = {
  id: ID,
  kind: 'event',
  headline: 'Pizza night',
  starts_at: '2026-11-01T00:00:00Z',
  ends_at: null,
  created_at: '2026-10-30T12:00:00Z',
  location_label: 'Midtown',
  photo_url: 'https://cdn.example/pizza.webp',
  sample_kind: null,
}

beforeEach(() => vi.clearAllMocks())

describe('resolveSharedPost', () => {
  it('is nothing for an id that is not a post id, without a read', async () => {
    expect(await resolveSharedPost(dbRpc, SHOP, 'edit')).toBeNull()
    expect(resolvePagePosts).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
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

  // Don, 2026-10-31 (B, #1126): signed out, the post's headline, lead-line fields and photo, read through a projection
  // that carries no body, and only for a post the Page shows the public.
  it('signed out: withheld, with the headline, lead-line fields and photo from the bodiless read', async () => {
    viewerId.mockResolvedValue(null)
    rpc.mockResolvedValue({ data: [ROW], error: null })
    expect(await resolveSharedPost(dbRpc, SHOP, ID)).toEqual({
      access: 'withheld',
      preview: {
        id: ID,
        kind: 'event',
        headline: 'Pizza night',
        startsAt: '2026-11-01T00:00:00Z',
        endsAt: null,
        createdAt: '2026-10-30T12:00:00Z',
        locationLabel: 'Midtown',
        photoUrl: 'https://cdn.example/pizza.webp',
        sampleKind: null,
      },
    })
    expect(rpc).toHaveBeenCalledWith('shared_post_preview', { p_group_id: 'g-1', p_post_id: ID })
    expect(resolvePagePosts).not.toHaveBeenCalled()
  })

  it('signed out: a headline carrying an email is masked', async () => {
    viewerId.mockResolvedValue(null)
    rpc.mockResolvedValue({ data: [{ ...ROW, headline: 'Write a@b.co' }], error: null })
    const r = await resolveSharedPost(dbRpc, SHOP, ID)
    expect(r && r.access === 'withheld' && r.preview.headline).not.toContain('a@b.co')
  })

  it('signed out: nothing when the read returns no post (draft, hidden, unlisted, a Page not live) or fails', async () => {
    viewerId.mockResolvedValue(null)
    rpc.mockResolvedValue({ data: [], error: null })
    expect(await resolveSharedPost(dbRpc, SHOP, ID)).toBeNull()
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await resolveSharedPost(dbRpc, SHOP, ID)).toBeNull()
  })
})

// #1139 (Don, 2026-11-01) — a post's readable address names it by its slug.
describe('resolvePostIdBySlug', () => {
  const maybeSingle = vi.fn()
  const eq2 = vi.fn(() => ({ maybeSingle }))
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  const from = vi.fn(() => ({ select: () => ({ eq: eq1 }) }))
  const client = { rpc, from } as never

  it('is nothing for a slug the database would never mint, without a read', async () => {
    expect(await resolvePostIdBySlug(client, SHOP, 'Not_A_Slug')).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })
  it('signed in: the post RLS lets this reader see, by its slug on this Page', async () => {
    viewerId.mockResolvedValue('m-1')
    maybeSingle.mockResolvedValue({ data: { id: ID }, error: null })
    expect(await resolvePostIdBySlug(client, SHOP, 'pizza-night')).toBe(ID)
    expect(eq1).toHaveBeenCalledWith('group_id', 'g-1')
    expect(eq2).toHaveBeenCalledWith('url_slug', 'pizza-night')
  })
  it('signed out: through the one read that answers only for a live, listed post', async () => {
    viewerId.mockResolvedValue(null)
    rpc.mockResolvedValue({ data: ID, error: null })
    expect(await resolvePostIdBySlug(client, SHOP, 'pizza-night')).toBe(ID)
    expect(rpc).toHaveBeenCalledWith('page_post_id_by_slug', { p_group_id: 'g-1', p_slug: 'pizza-night' })
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await resolvePostIdBySlug(client, SHOP, 'gone')).toBeNull()
  })
})

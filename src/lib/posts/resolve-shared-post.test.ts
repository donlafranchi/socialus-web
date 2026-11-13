import { describe, it, expect, vi, beforeEach } from 'vitest'

// A shared post's address answers only what its reader could already read: the post RLS returns, signed in or out
// (F134 — a visitor reads what a signed-in stranger reads), and anyone else nothing.

const { resolvePagePosts } = vi.hoisted(() => ({ resolvePagePosts: vi.fn() }))
vi.mock('@/lib/groups/page-posts', () => ({ resolvePagePosts }))

import { resolveSharedPost, resolvePostIdBySlug } from './resolve-shared-post'

const ID = '0b6c1e9a-4a3f-4f7e-9d6b-2c1a5e8f7d10'
const SHOP = { groupId: 'g-1' } as never
const db = {} as never

beforeEach(() => vi.clearAllMocks())

describe('resolveSharedPost', () => {
  it('is nothing for an id that is not a post id, without a read', async () => {
    expect(await resolveSharedPost(db, SHOP, 'edit')).toBeNull()
    expect(resolvePagePosts).not.toHaveBeenCalled()
  })

  // [guards F134.8 partial: a shared post's own address lands on the post, readable, through the one read every reader gets]
  it('the post as RLS returns it, asked for by id on its own Page, whoever is reading', async () => {
    resolvePagePosts.mockResolvedValue([{ id: ID, body: 'x' }])
    expect(await resolveSharedPost(db, SHOP, ID)).toEqual({ id: ID, body: 'x' })
    expect(resolvePagePosts).toHaveBeenCalledWith(db, 'g-1', undefined, { postId: ID })
  })

  it('nothing when RLS returns nothing (a draft, unlisted, followers-only or removed post, or another Page’s)', async () => {
    resolvePagePosts.mockResolvedValue([])
    expect(await resolveSharedPost(db, SHOP, ID)).toBeNull()
  })
})

// #1139 (Don, 2026-11-01) — a post's readable address names it by its slug.
describe('resolvePostIdBySlug', () => {
  const maybeSingle = vi.fn()
  const eq2 = vi.fn(() => ({ maybeSingle }))
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  const from = vi.fn(() => ({ select: () => ({ eq: eq1 }) }))
  const client = { from } as never

  it('is nothing for a slug the database would never mint, without a read', async () => {
    expect(await resolvePostIdBySlug(client, SHOP, 'Not_A_Slug')).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })
  it('the post RLS lets this reader see, by its slug on this Page', async () => {
    maybeSingle.mockResolvedValue({ data: { id: ID }, error: null })
    expect(await resolvePostIdBySlug(client, SHOP, 'pizza-night')).toBe(ID)
    expect(eq1).toHaveBeenCalledWith('group_id', 'g-1')
    expect(eq2).toHaveBeenCalledWith('url_slug', 'pizza-night')
    maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await resolvePostIdBySlug(client, SHOP, 'gone')).toBeNull()
  })
})

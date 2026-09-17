import { describe, it, expect, vi, beforeEach } from 'vitest'

// The bug: Don made two Pages, both active and listed with a real anchor
// location, and could see neither anywhere in the product. No surface has ever
// listed a member's own Pages — SellCta finds a DRAFT to resume and lets an
// active Page fall through.

const { fetchGroupPrefixes } = vi.hoisted(() => ({ fetchGroupPrefixes: vi.fn() }))
vi.mock('@/lib/feed/group-prefixes', () => ({ fetchGroupPrefixes }))

import { getOwnPages } from './own-pages'

const MEMBER = 'm-1'

function client(rows: unknown[], error: { message: string } | null = null) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'order']) {
    q[m] = vi.fn(() => q)
  }
  q.limit = vi.fn(async () => ({ data: rows, error }))
  return { from: vi.fn(() => q), rpc: vi.fn(), _q: q }
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'g-1',
  name: 'SacRiver Floaters',
  slug: 'sacriver-floaters',
  kind: 'business',
  category: null,
  description: null,
  photo_url: null,
  photo_hidden_at: null,
  lifecycle_state: 'active',
  anchor: { label: 'East Sacramento', kind: 'permanent' },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  fetchGroupPrefixes.mockResolvedValue(new Map([['g-1', { slug: 'sacriver-floaters', placePath: 'ca/sacramento' }]]))
})

describe('getOwnPages', () => {
  it('returns the member’s active Page — the thing that was invisible', async () => {
    const c = client([row()])
    const out = await getOwnPages(c as never, MEMBER)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ name: 'SacRiver Floaters', lifecycleState: 'active' })
  })

  it('asks for the founder’s own rows and excludes dissolved ones', async () => {
    const c = client([row()])
    await getOwnPages(c as never, MEMBER)
    expect(c._q.eq).toHaveBeenCalledWith('founder_member_id', MEMBER)
    expect(c._q.is).toHaveBeenCalledWith('dissolved_at', null)
  })

  it('includes drafts — a half-finished Page vanishing is the same bug again', async () => {
    const c = client([row({ id: 'g-2', lifecycle_state: 'draft' })])
    const out = await getOwnPages(c as never, MEMBER)
    expect(out[0].lifecycleState).toBe('draft')
  })

  it('gives an active Page a link and a draft none — a draft link 404s for its own author', async () => {
    const c = client([row(), row({ id: 'g-2', lifecycle_state: 'draft' })])
    const out = await getOwnPages(c as never, MEMBER)
    expect(out.find((p) => p.groupId === 'g-1')?.href).toBe('/p/ca/sacramento/g/sacriver-floaters')
    expect(out.find((p) => p.groupId === 'g-2')?.href).toBeNull()
  })

  it('reads the scale off the Location’s own kind rather than guessing', async () => {
    const c = client([
      row({ anchor: { label: 'East Sacramento', kind: 'area' } }),
      row({ id: 'g-2', anchor: { label: '3117 Broadway', kind: 'permanent' } }),
    ])
    const out = await getOwnPages(c as never, MEMBER)
    expect(out[0].location).toEqual({ scale: 'neighbourhood', label: 'East Sacramento' })
    expect(out[1].location).toEqual({ scale: 'address', label: '3117 Broadway' })
  })

  // Saying "Online" about a half-finished draft would be a claim its author
  // never made.
  it('says the location is not chosen yet when there is no anchor', async () => {
    const c = client([row({ anchor: null })])
    const out = await getOwnPages(c as never, MEMBER)
    expect(out[0].location).toEqual({ scale: 'none' })
  })

  it('applies the photo hide, like every other surface that reads a photo', async () => {
    const c = client([row({ photo_url: 'https://x/a.webp', photo_hidden_at: '2026-09-16T00:00:00Z' })])
    const out = await getOwnPages(c as never, MEMBER)
    expect(out[0].photoUrl).toBeNull()
  })

  it('fails loudly and returns nothing rather than throwing into the page', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = client([], { message: 'boom' })
    await expect(getOwnPages(c as never, MEMBER)).resolves.toEqual([])
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// The bug: Don made two Pages, both active and listed with a real anchor
// location, and could see neither anywhere in the product. No surface has ever
// listed a member's own Pages — SellCta finds a DRAFT to resume and lets an
// active Page fall through.

import { getOwnPages } from './own-pages'

const MEMBER = 'm-1'

// By default the member founded and manages every row; `ids` overrides either.
function client(
  rows: unknown[],
  error: { message: string } | null = null,
  ids: { founded?: string[]; managing?: string[] } = {},
) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'or', 'order']) {
    q[m] = vi.fn(() => q)
  }
  q.limit = vi.fn(async () => ({ data: rows, error }))
  const all = rows.map((r) => (r as { id: string }).id)
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'current_member_managing_group_ids' ? (ids.managing ?? all) : (ids.founded ?? all),
    error: null,
  }))
  return { from: vi.fn(() => q), rpc, _q: q }
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'g-1',
  name: 'SacRiver Floaters',
  slug: 'sacriver-floaters',
  public_id: 'q4vw2n',
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
})

describe('getOwnPages', () => {
  it('returns the member’s active Page — the thing that was invisible', async () => {
    const c = client([row()])
    const out = await getOwnPages(c as never, MEMBER)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ name: 'SacRiver Floaters', lifecycleState: 'active' })
  })

  // #253 — groups.founder_member_id answers nobody, so the founder's own Pages
  // come from current_member_founded_group_ids(), read as the founder.
  it('asks for the founder’s own Pages by id, never by the founder column, and only dissolved ones still restorable', async () => {
    const c = client([row()])
    await getOwnPages(c as never, MEMBER)
    expect(c.rpc).toHaveBeenCalledWith('current_member_founded_group_ids')
    expect(c._q.in).toHaveBeenCalledWith('id', ['g-1'])
    expect(c._q.eq).not.toHaveBeenCalledWith('founder_member_id', expect.anything())
    expect(c._q.or).toHaveBeenCalledWith('dissolved_at.is.null,delete_after.not.is.null')
    expect(c._q.select).toHaveBeenCalledWith(expect.stringContaining('delete_after'))
  })

  // #423 — archived and deleted Pages come back here, and only here, to restore.
  describe('#423 — archived and deleted Pages', () => {
    const NOW = new Date('2026-10-06T12:00:00Z')

    it('lists an archived Page, still linked, so its owner can look at it', async () => {
      const c = client([row({ lifecycle_state: 'archived' })])
      const [p] = await getOwnPages(c as never, MEMBER, NOW)
      expect(p).toMatchObject({ lifecycleState: 'archived', deleteAfter: null, href: '/g/q4vw2n' })
    })

    it('lists a deleted Page with the date it goes, and no link, since its address is gone', async () => {
      const c = client([row({ lifecycle_state: 'dissolved', delete_after: '2026-10-20T12:00:00Z' })])
      const [p] = await getOwnPages(c as never, MEMBER, NOW)
      expect(p).toMatchObject({ lifecycleState: 'dissolved', deleteAfter: '2026-10-20T12:00:00Z', href: null })
    })

    it('leaves out a deleted Page whose 14 days have passed, and one with no date', async () => {
      const c = client([
        row({ id: 'g-2', lifecycle_state: 'dissolved', delete_after: '2026-10-06T11:59:59Z' }),
        row({ id: 'g-3', lifecycle_state: 'dissolved', delete_after: null }),
      ])
      expect(await getOwnPages(c as never, MEMBER, NOW)).toEqual([])
    })

    // The PM, 2026-10-06: a hidden Page goes by who manages it, not who founded it.
    it('lists a hidden Page the member manages but did not found', async () => {
      const c = client([row({ id: 'g-9', lifecycle_state: 'archived' })], null, { founded: [], managing: ['g-9'] })
      const out = await getOwnPages(c as never, MEMBER, NOW)
      expect(c.rpc).toHaveBeenCalledWith('current_member_managing_group_ids')
      expect(c._q.in).toHaveBeenCalledWith('id', ['g-9'])
      expect(out.map((p) => p.groupId)).toEqual(['g-9'])
    })

    it('leaves out a hidden Page the member founded but no longer manages', async () => {
      const c = client([row({ id: 'g-9', lifecycle_state: 'archived' })], null, { founded: ['g-9'], managing: [] })
      expect(await getOwnPages(c as never, MEMBER, NOW)).toEqual([])
    })

    it('still lists only founded Pages while they are live or drafts', async () => {
      const c = client([row({ id: 'g-9' }), row({ id: 'g-8', lifecycle_state: 'draft' })], null, {
        founded: [],
        managing: ['g-9', 'g-8'],
      })
      expect(await getOwnPages(c as never, MEMBER, NOW)).toEqual([])
    })
  })

  it('includes drafts — a half-finished Page vanishing is the same bug again', async () => {
    const c = client([row({ id: 'g-2', lifecycle_state: 'draft' })])
    const out = await getOwnPages(c as never, MEMBER)
    expect(out[0].lifecycleState).toBe('draft')
  })

  // Issue #175 — the whole reported symptom. Don saw the Pages he had made and
  // not one of them was clickable, because the href was derived from
  // `locations.place_id`, which nothing populates for anything a member makes.
  it('links every Page to its canonical address, carrying no place path', async () => {
    const c = client([row()])
    const out = await getOwnPages(c as never, MEMBER)
    expect(out[0].href).toBe('/g/q4vw2n')
  })

  it('links a draft too — its address is the one it keeps when it goes live', async () => {
    const c = client([row(), row({ id: 'g-2', lifecycle_state: 'draft', public_id: 'zt9w4p' })])
    const out = await getOwnPages(c as never, MEMBER)
    expect(out.find((p) => p.groupId === 'g-1')?.href).toBe('/g/q4vw2n')
    expect(out.find((p) => p.groupId === 'g-2')?.href).toBe('/g/zt9w4p')
  })

  it('asks for the public id, without which nothing here has an address', async () => {
    const c = client([row()])
    await getOwnPages(c as never, MEMBER)
    expect(c._q.select).toHaveBeenCalledWith(expect.stringContaining('public_id'))
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

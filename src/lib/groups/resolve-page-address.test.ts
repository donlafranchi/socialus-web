import { describe, it, expect, vi, beforeEach } from 'vitest'

const { resolveShop } = vi.hoisted(() => ({ resolveShop: vi.fn() }))
vi.mock('./resolve-shop', () => ({ resolveShop }))

import { resolvePageByHandle } from './resolve-page-address'

// Issue #175 — resolving a Page at its canonical address.
//
// Two rules from the ruling (ops-pattern planning/URL-IDENTITY.md) are what
// these tests hold: the ID resolves and the slug does not, and an address that
// is not the canonical one REDIRECTS rather than being served as a second copy
// of the Page. The second is what stops the duplicate-address defect this
// issue already carries — /p/ca/sacramento/g/mayas-bakery and
// /p/ny/albany/g/mayas-bakery both rendering the same Page.

const SHOP = {
  groupId: 'grp-1',
  slug: 'joes-pizza',
  publicId: '7k3x8m',
  lifecycleState: 'active',
}

const supabase = {} as Parameters<typeof resolvePageByHandle>[0]

beforeEach(() => resolveShop.mockReset())

describe('resolvePageByHandle', () => {
  it('resolves by the id, not the slug', async () => {
    resolveShop.mockResolvedValueOnce(SHOP)
    const found = await resolvePageByHandle(supabase, 'joes-pizza-7k3x8m')
    expect(resolveShop).toHaveBeenCalledWith(supabase, '7k3x8m', { by: 'publicId' })
    expect(found?.shop).toBe(SHOP)
    expect(found?.redirectTo).toBeNull()
  })

  it('serves a stale slug by redirecting to the canonical address, never by rendering it', async () => {
    resolveShop.mockResolvedValueOnce(SHOP)
    const found = await resolvePageByHandle(supabase, 'the-old-name-7k3x8m')
    expect(found?.shop).toBe(SHOP)
    expect(found?.redirectTo).toBe('/g/joes-pizza-7k3x8m')
  })

  it('redirects an address typed in upper case', async () => {
    resolveShop.mockResolvedValueOnce(SHOP)
    const found = await resolvePageByHandle(supabase, 'JOES-PIZZA-7K3X8M')
    expect(resolveShop).toHaveBeenCalledWith(supabase, '7k3x8m', { by: 'publicId' })
    expect(found?.redirectTo).toBe('/g/joes-pizza-7k3x8m')
  })

  it('falls back to the whole handle as a slug when no id matches', async () => {
    // `mayas-bakery` splits as slug `mayas` + id `bakery`, because `bakery` is
    // six characters and all of them are in the alphabet. Nothing has that id,
    // so the handle is tried whole — and the Page found that way redirects to
    // its real address rather than acquiring a second one.
    resolveShop.mockResolvedValueOnce(null)
    resolveShop.mockResolvedValueOnce({ ...SHOP, slug: 'mayas-bakery', publicId: 'q4vw2n' })
    const found = await resolvePageByHandle(supabase, 'mayas-bakery')
    expect(resolveShop).toHaveBeenNthCalledWith(1, supabase, 'bakery', { by: 'publicId' })
    expect(resolveShop).toHaveBeenNthCalledWith(2, supabase, 'mayas-bakery', {})
    expect(found?.redirectTo).toBe('/g/mayas-bakery-q4vw2n')
  })

  it('tries a handle with no id-shaped tail as a slug straight away', async () => {
    resolveShop.mockResolvedValueOnce({ ...SHOP, slug: 'sourdough-co', publicId: 'zt9w4p' })
    const found = await resolvePageByHandle(supabase, 'sourdough-co')
    expect(resolveShop).toHaveBeenCalledTimes(1)
    expect(resolveShop).toHaveBeenCalledWith(supabase, 'sourdough-co', {})
    expect(found?.redirectTo).toBe('/g/sourdough-co-zt9w4p')
  })

  it('is null when neither the id nor the slug finds anything', async () => {
    resolveShop.mockResolvedValue(null)
    expect(await resolvePageByHandle(supabase, 'nothing-here-abc123')).toBeNull()
  })

  it('is null for a dissolved Page — a dissolved Page has no address', async () => {
    resolveShop.mockResolvedValueOnce({ ...SHOP, lifecycleState: 'dissolved' })
    expect(await resolvePageByHandle(supabase, 'joes-pizza-7k3x8m')).toBeNull()
  })

  it('resolves a draft at its canonical address, because its owner previews it there', async () => {
    resolveShop.mockResolvedValueOnce({ ...SHOP, lifecycleState: 'draft' })
    const found = await resolvePageByHandle(supabase, 'joes-pizza-7k3x8m')
    expect(found?.shop.lifecycleState).toBe('draft')
    expect(found?.redirectTo).toBeNull()
  })
})

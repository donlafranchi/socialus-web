import { describe, it, expect, vi, beforeEach } from 'vitest'

const { resolveShop } = vi.hoisted(() => ({ resolveShop: vi.fn() }))
vi.mock('./resolve-shop', () => ({ resolveShop }))

import { resolvePageById, resolvePageByAddress } from './resolve-page-address'

// #411 — the PM, 2026-10-06: /g/<id> is the only Page address. There are no
// members or shared links yet, so older forms are not forwarded; they are not
// found. Revisit forwarding once real members exist.

const SHOP = {
  groupId: 'grp-1',
  slug: 'joes-pizza',
  publicId: '7k3x8m',
  lifecycleState: 'active',
}

const supabase = {} as Parameters<typeof resolvePageById>[0]

beforeEach(() => resolveShop.mockReset())

describe('resolvePageById', () => {
  it('serves the id, the only address', async () => {
    resolveShop.mockResolvedValueOnce(SHOP)
    expect(await resolvePageById(supabase, '7k3x8m')).toBe(SHOP)
    expect(resolveShop).toHaveBeenCalledWith(supabase, '7k3x8m', { by: 'publicId' })
  })

  it.each([
    ['the name-and-id form', 'joes-pizza-7k3x8m'],
    ['a bare slug', 'joes-pizza'],
    ['the id in capitals', '7K3X8M'],
    ['an id of the wrong length', '7k3x8'],
    ['a character outside the alphabet', '7k3x8u'],
  ])('finds nothing at %s, without looking', async (_what, handle) => {
    expect(await resolvePageById(supabase, handle)).toBeNull()
    expect(resolveShop).not.toHaveBeenCalled()
  })

  it('is null when no Page has that id', async () => {
    resolveShop.mockResolvedValueOnce(null)
    expect(await resolvePageById(supabase, 'zt9w4p')).toBeNull()
  })

  it('is null for a dissolved Page — a dissolved Page has no address', async () => {
    resolveShop.mockResolvedValueOnce({ ...SHOP, lifecycleState: 'dissolved' })
    expect(await resolvePageById(supabase, '7k3x8m')).toBeNull()
  })

  it('serves a draft at its address, because its owner previews it there', async () => {
    resolveShop.mockResolvedValueOnce({ ...SHOP, lifecycleState: 'draft' })
    expect((await resolvePageById(supabase, '7k3x8m'))?.lifecycleState).toBe('draft')
  })
})

// #1139 (Don, 2026-11-01) — the readable address: /<place>-<st>/<page-slug>.
describe('resolvePageByAddress', () => {
  it('finds the Page by its place and slug', async () => {
    resolveShop.mockResolvedValueOnce(SHOP)
    expect(await resolvePageByAddress(supabase, 'sacramento-ca', 'plant-foundry')).toBe(SHOP)
    expect(resolveShop).toHaveBeenCalledWith(supabase, 'sacramento-ca/plant-foundry', { by: 'address' })
  })
  it.each([
    ['a place with no state', 'sacramento', 'plant-foundry'],
    ['a reserved word', 'explore', 'plant-foundry'],
    ['capitals', 'Sacramento-CA', 'plant-foundry'],
    ['a slug with odd characters', 'sacramento-ca', 'plant_foundry'],
  ])('finds nothing at %s, without looking', async (_what, place, page) => {
    expect(await resolvePageByAddress(supabase, place, page)).toBeNull()
    expect(resolveShop).not.toHaveBeenCalled()
  })
  it('a dissolved Page has no address', async () => {
    resolveShop.mockResolvedValueOnce({ ...SHOP, lifecycleState: 'dissolved' })
    expect(await resolvePageByAddress(supabase, 'sacramento-ca', 'plant-foundry')).toBeNull()
  })
})

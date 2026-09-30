// T079 — Unit tests for the product resolver.
// T095 — Updated: attribution model (Group vs Member + conditional link).
// Trace: F038 § Item URL pattern + § Item page shows attribution + skip-path.

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  splitItemSlug,
  parseIdFragment,
  resolveProduct,
} from './resolve-product'

describe('splitItemSlug', () => {
  it('returns the item split for …/g/<group>/p/<item>', () => {
    expect(
      splitItemSlug(['ca', 'sacramento', 'oak-park', 'g', 'oak-park-sourdough-a1', 'p', 'loaf-deadbeef']),
    ).toEqual({
      placeSegments: ['ca', 'sacramento', 'oak-park'],
      groupSlug: 'oak-park-sourdough-a1',
      itemSlug: 'loaf-deadbeef',
    })
  })

  it('returns null for a bare …/g/<group> (that stays the Shop page)', () => {
    expect(splitItemSlug(['ca', 'sacramento', 'g', 'oak-park-sourdough-a1'])).toBeNull()
  })

  it('returns null for a bare place path', () => {
    expect(splitItemSlug(['ca', 'sacramento', 'oak-park'])).toBeNull()
  })

  it('returns null when the marker after the group slug is not "p"', () => {
    expect(splitItemSlug(['ca', 'g', 'shop-a1', 'l', 'venue'])).toBeNull()
  })
})

describe('parseIdFragment', () => {
  it('returns the trailing hyphen segment', () => {
    expect(parseIdFragment('country-sourdough-loaf-deadbeef')).toBe('deadbeef')
    expect(parseIdFragment('loaf-a1b2c3d4')).toBe('a1b2c3d4')
  })
  it('returns empty for a hyphenless slug', () => {
    expect(parseIdFragment('loaf')).toBe('')
  })
})

// Chainable Supabase stub: every builder method returns the same object; the
// object is awaitable (resolves to {data,error}) and exposes maybeSingle().
function chainable(result: { data: unknown; error?: unknown }) {
  const p: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'limit', 'in', 'order']) {
    p[m] = (...args: unknown[]) => {
      if (m === 'select' || m === 'eq') read.push(`${m}:${String(args[0])}`)
      return p
    }
  }
  p.maybeSingle = () => Promise.resolve(result)
  p.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return p
}

const read: string[] = []

function makeSupabase(routes: Record<string, { data: unknown; error?: unknown }>) {
  read.length = 0
  return {
    from: (table: string) => {
      read.push(table)
      return chainable(routes[table] ?? { data: null })
    },
    rpc: (fn: string) => {
      read.push(fn)
      return Promise.resolve(routes[fn] ?? { data: null })
    },
  } as unknown as SupabaseClient
}

const ITEM_ID = 'deadbeef-1111-2222-3333-444455556666'

function productRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    title: 'Country Sourdough Loaf',
    description: 'Naturally leavened.',
    brand_label: 'Oak Park Sourdough',
    made_at_place_id: null,
    member_id: 'mem-maya',
    item_products: { price_cents: 900, price_unit: 'loaf', photo_urls: [] },
    owner: { handle: 'maya', display_name: 'Maya Chen' },
    item_locations: [{ removed_at: null, locations: { label: "Maya's Kitchen" } }],
    ...overrides,
  }
}

describe('resolveProduct — group path (T095 Group-attribution)', () => {
  it('attributes to the Group (kind=group, name=brand_label); members embed is not consulted', async () => {
    const supabase = makeSupabase({
      groups: { data: { id: 'g1', name: 'Repair Cafe Regulars' } },
      items: { data: [productRow()] },
    })
    const result = await resolveProduct(supabase, {
      groupSlug: 'oak-park-sourdough-a1',
      itemSlug: 'country-sourdough-loaf-deadbeef',
    })
    expect(result).not.toBeNull()
    expect(result!.itemId).toBe(ITEM_ID)
    expect(result!.priceCents).toBe(900)
    expect(result!.priceUnit).toBe('loaf')
    expect(result!.brandLabel).toBe('Oak Park Sourdough')
    expect(result!.attribution).toEqual({ kind: 'group', name: 'Oak Park Sourdough' })
    expect(result!.pickup).toEqual({ label: "Maya's Kitchen" })
    expect(result!.madeAtPlaceId).toBeNull()
  })

  it('falls back to the Group name when a Group-filed product has no brand_label (T119)', async () => {
    const supabase = makeSupabase({
      groups: { data: { id: 'g1', name: 'Repair Cafe Regulars' } },
      items: { data: [productRow({ brand_label: null })] },
    })
    const result = await resolveProduct(supabase, {
      groupSlug: 'oak-park-sourdough-a1',
      itemSlug: 'country-sourdough-loaf-deadbeef',
    })
    expect(result).not.toBeNull()
    expect(result!.attribution).toEqual({ kind: 'group', name: 'Repair Cafe Regulars' })
  })

  it('returns null when no row id matches the slug fragment', async () => {
    const supabase = makeSupabase({
      groups: { data: { id: 'g1', name: 'Repair Cafe Regulars' } },
      items: { data: [productRow()] },
    })
    const result = await resolveProduct(supabase, {
      groupSlug: 'oak-park-sourdough-a1',
      itemSlug: 'country-sourdough-loaf-00000000',
    })
    expect(result).toBeNull()
  })

  it('returns null when the group is not found', async () => {
    const supabase = makeSupabase({ groups: { data: null }, items: { data: [] } })
    const result = await resolveProduct(supabase, {
      groupSlug: 'nope',
      itemSlug: 'loaf-deadbeef',
    })
    expect(result).toBeNull()
  })
})

// #253 — an item posted without a Page resolves from the handle and id in its
// URL through posted_item_id, and names no poster: nobody reads who made it.
describe('resolveProduct — individual path', () => {
  it('resolves through posted_item_id, attributes to nobody, and reads no member column', async () => {
    const calls: unknown[] = []
    const supabase = makeSupabase({
      posted_item_id: { data: 'deadbeef-1111-2222-3333-444455556666' },
      items: { data: [productRow({ brand_label: null })] },
    })
    const rpc = supabase.rpc as unknown as (fn: string, args: unknown) => Promise<unknown>
    ;(supabase as unknown as { rpc: typeof rpc }).rpc = (fn: string, args: unknown) => {
      calls.push([fn, args])
      return rpc(fn, args)
    }
    const result = await resolveProduct(supabase, { handle: 'maya', itemSlug: 'country-sourdough-loaf-deadbeef' })
    expect(result).not.toBeNull()
    expect(result!.attribution).toEqual({ kind: 'none' })
    expect(calls).toContainEqual(['posted_item_id', { p_handle: 'maya', p_kind: 'product', p_id_prefix: 'deadbeef' }])
    expect(read).not.toContain('members')
    expect(read).not.toContain('post_author_public')
    expect(read.filter((r) => /^(select|eq):/.test(r) && /\bmember_id\b/.test(r))).toEqual([])
  })

  it('returns null when the URL names no item', async () => {
    const supabase = makeSupabase({ posted_item_id: { data: null }, items: { data: [] } })
    expect(await resolveProduct(supabase, { handle: 'maya', itemSlug: 'country-sourdough-loaf-deadbeef' })).toBeNull()
  })
})

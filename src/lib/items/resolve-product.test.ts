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
    p[m] = () => p
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

// #246 — nobody reads another member's row, so the poster comes from
// post_author_public, and the name never links to a profile only its owner can open.
describe('resolveProduct — individual path', () => {
  it('attributes to the poster by display name, and reads no member row', async () => {
    const supabase = makeSupabase({
      post_author_public: { data: [{ member_id: 'mem-maya', display_name: 'Maya Chen', avatar_url: null }] },
      items: { data: [productRow({ brand_label: null })] },
    })
    const result = await resolveProduct(supabase, { handle: 'maya', itemSlug: 'country-sourdough-loaf-deadbeef' })
    expect(result).not.toBeNull()
    expect(result!.brandLabel).toBeNull()
    expect(result!.attribution).toEqual({
      kind: 'member',
      handle: 'maya',
      displayName: 'Maya Chen',
      hasPublished: false,
    })
    expect(read).not.toContain('members')
    expect(read).not.toContain('member_public_has_published')
  })

  it('returns null when the handle has posted nothing', async () => {
    const supabase = makeSupabase({
      post_author_public: { data: [] },
      items: { data: [productRow({ brand_label: null })] },
    })
    expect(await resolveProduct(supabase, { handle: 'maya', itemSlug: 'country-sourdough-loaf-deadbeef' })).toBeNull()
  })
})

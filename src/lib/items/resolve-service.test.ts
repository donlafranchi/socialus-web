// T083 — Unit tests for the service resolver.
// T095 — Updated: attribution model (Group vs Member + conditional link).
// Trace: F040 § Item URL pattern + § Item page shows attribution + service area + pricing.

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { splitServiceSlug, resolveService } from './resolve-service'

describe('splitServiceSlug', () => {
  it('returns the item split for …/g/<group>/s/<item>', () => {
    expect(
      splitServiceSlug(['ca', 'sacramento', 'oak-park', 'g', 'maya-music-a1', 's', 'piano-deadbeef']),
    ).toEqual({
      placeSegments: ['ca', 'sacramento', 'oak-park'],
      groupSlug: 'maya-music-a1',
      itemSlug: 'piano-deadbeef',
    })
  })

  it('returns null for a product path (…/g/<group>/p/<item>)', () => {
    expect(splitServiceSlug(['ca', 'g', 'shop-a1', 'p', 'loaf-deadbeef'])).toBeNull()
  })

  it('returns null for a bare …/g/<group>', () => {
    expect(splitServiceSlug(['ca', 'sacramento', 'g', 'maya-music-a1'])).toBeNull()
  })

  it('returns null for a bare place path', () => {
    expect(splitServiceSlug(['ca', 'sacramento'])).toBeNull()
  })
})

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

function serviceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    title: 'Piano lessons',
    description: 'In-home, 30 minutes.',
    brand_label: 'Maya Music',
    member_id: 'mem-maya',
    item_services: {
      rate_model: 'hourly',
      rate_cents: 9500,
      service_area_geography: '0103000020E6100000...',
    },
    owner: { handle: 'maya', display_name: 'Maya Chen' },
    item_locations: [{ removed_at: null, locations: { label: 'Studio' } }],
    ...overrides,
  }
}

describe('resolveService — group path (T095 Group-attribution)', () => {
  it('attributes to the Group (kind=group, name=brand_label)', async () => {
    const supabase = makeSupabase({
      groups: { data: { id: 'g1', name: 'Repair Cafe Regulars' } },
      items: { data: [serviceRow()] },
    })
    const result = await resolveService(supabase, {
      groupSlug: 'maya-music-a1',
      itemSlug: 'piano-lessons-deadbeef',
    })
    expect(result).not.toBeNull()
    expect(result!.itemId).toBe(ITEM_ID)
    expect(result!.rateModel).toBe('hourly')
    expect(result!.rateCents).toBe(9500)
    expect(result!.hasServiceArea).toBe(true)
    expect(result!.brandLabel).toBe('Maya Music')
    expect(result!.attribution).toEqual({ kind: 'group', name: 'Maya Music' })
    expect(result!.anchor).toEqual({ label: 'Studio' })
  })

  it('falls back to the Group name when a Group-filed service has no brand_label (T119)', async () => {
    const supabase = makeSupabase({
      groups: { data: { id: 'g1', name: 'Repair Cafe Regulars' } },
      items: { data: [serviceRow({ brand_label: null })] },
    })
    const result = await resolveService(supabase, {
      groupSlug: 'maya-music-a1',
      itemSlug: 'piano-lessons-deadbeef',
    })
    expect(result).not.toBeNull()
    expect(result!.attribution).toEqual({ kind: 'group', name: 'Repair Cafe Regulars' })
  })

  it('returns null when no row id matches the slug fragment', async () => {
    const supabase = makeSupabase({
      groups: { data: { id: 'g1', name: 'Repair Cafe Regulars' } },
      items: { data: [serviceRow()] },
    })
    const result = await resolveService(supabase, {
      groupSlug: 'maya-music-a1',
      itemSlug: 'piano-lessons-00000000',
    })
    expect(result).toBeNull()
  })

  it('returns null when the group is not found', async () => {
    const supabase = makeSupabase({ groups: { data: null }, items: { data: [] } })
    const result = await resolveService(supabase, {
      groupSlug: 'nope',
      itemSlug: 'piano-deadbeef',
    })
    expect(result).toBeNull()
  })
})

// #246 — nobody reads another member's row, so the poster comes from
// post_author_public, and the name never links to a profile only its owner can open.
describe('resolveService — individual path', () => {
  it('attributes to the poster by display name, and reads no member row', async () => {
    const supabase = makeSupabase({
      post_author_public: { data: [{ member_id: 'mem-maya', display_name: 'Maya Chen', avatar_url: null }] },
      items: { data: [serviceRow({ brand_label: null })] },
    })
    const result = await resolveService(supabase, { handle: 'maya', itemSlug: 'piano-lessons-deadbeef' })
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
      items: { data: [serviceRow({ brand_label: null })] },
    })
    expect(await resolveService(supabase, { handle: 'maya', itemSlug: 'piano-lessons-deadbeef' })).toBeNull()
  })
})

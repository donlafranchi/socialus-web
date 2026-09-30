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
      item_locations: { data: [{ removed_at: null, locations: { label: 'Studio' } }] },
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
      item_locations: { data: [{ removed_at: null, locations: { label: 'Studio' } }] },
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
      item_locations: { data: [{ removed_at: null, locations: { label: 'Studio' } }] },
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

// F093 criterion 8 (amended 2026-09-30) — an item's location is read on its
// own, so a signed-out caller, whom the database refuses it, still gets the item.
describe('resolveService — its location', () => {
  it('is not embedded in the read that finds the item', async () => {
    const supabase = makeSupabase({
      posted_item_id: { data: 'deadbeef-1111-2222-3333-444455556666' },
      items: { data: [serviceRow({ brand_label: null })] },
    })
    await resolveService(supabase, { handle: 'maya', itemSlug: 'piano-lessons-deadbeef' })
    const itemRead = read.find((r) => r.startsWith('select:id, title'))
    expect(itemRead).toBeDefined()
    expect(itemRead).not.toContain('locations(')
    expect(read).toContain('item_locations')
  })

  it('is absent, and the item still resolves, when the caller may not read it', async () => {
    const supabase = makeSupabase({
      posted_item_id: { data: 'deadbeef-1111-2222-3333-444455556666' },
      item_locations: { data: null, error: { message: 'permission denied for table locations' } },
      items: { data: [serviceRow({ brand_label: null })] },
    })
    const result = await resolveService(supabase, { handle: 'maya', itemSlug: 'piano-lessons-deadbeef' })
    expect(result).not.toBeNull()
    expect(result!.anchor).toBeNull()
  })
})

// #253 — an item posted without a Page resolves from the handle and id in its
// URL through posted_item_id, and names no poster: nobody reads who made it.
describe('resolveService — individual path', () => {
  it('resolves through posted_item_id, attributes to nobody, and reads no member column', async () => {
    const calls: unknown[] = []
    const supabase = makeSupabase({
      posted_item_id: { data: 'deadbeef-1111-2222-3333-444455556666' },
      item_locations: { data: [{ removed_at: null, locations: { label: 'Studio' } }] },
      items: { data: [serviceRow({ brand_label: null })] },
    })
    const rpc = supabase.rpc as unknown as (fn: string, args: unknown) => Promise<unknown>
    ;(supabase as unknown as { rpc: typeof rpc }).rpc = (fn: string, args: unknown) => {
      calls.push([fn, args])
      return rpc(fn, args)
    }
    const result = await resolveService(supabase, { handle: 'maya', itemSlug: 'piano-lessons-deadbeef' })
    expect(result).not.toBeNull()
    expect(result!.attribution).toEqual({ kind: 'none' })
    expect(calls).toContainEqual(['posted_item_id', { p_handle: 'maya', p_kind: 'service', p_id_prefix: 'deadbeef' }])
    expect(read).not.toContain('members')
    expect(read).not.toContain('post_author_public')
    expect(read.filter((r) => /^(select|eq):/.test(r) && /\bmember_id\b/.test(r))).toEqual([])
  })

  it('returns null when the URL names no item', async () => {
    const supabase = makeSupabase({ posted_item_id: { data: null }, items: { data: [] } })
    expect(await resolveService(supabase, { handle: 'maya', itemSlug: 'piano-lessons-deadbeef' })).toBeNull()
  })
})

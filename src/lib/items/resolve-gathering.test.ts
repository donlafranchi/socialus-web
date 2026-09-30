// T082 — Unit tests for the gathering resolver.
// T095 — Updated: attribution model (Group vs Member + conditional link).
// Trace: F034 § Item URL pattern + § Item page shows attribution + next occurrence + Share-link.

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  splitGatheringSlug,
  describeRecurrence,
  nextOccurrence,
  resolveGathering,
} from './resolve-gathering'

describe('splitGatheringSlug', () => {
  it('returns the item split for …/g/<group>/e/<item>', () => {
    expect(
      splitGatheringSlug(['ca', 'sacramento', 'oak-park', 'g', 'drakes-a1', 'e', 'run-club-deadbeef']),
    ).toEqual({
      placeSegments: ['ca', 'sacramento', 'oak-park'],
      groupSlug: 'drakes-a1',
      itemSlug: 'run-club-deadbeef',
    })
  })

  it('returns null for a bare …/g/<group> (the Shop page)', () => {
    expect(splitGatheringSlug(['ca', 'g', 'drakes-a1'])).toBeNull()
  })

  it('returns null when the marker after the group slug is "p" (a product)', () => {
    expect(splitGatheringSlug(['ca', 'g', 'drakes-a1', 'p', 'loaf-deadbeef'])).toBeNull()
  })
})

describe('describeRecurrence', () => {
  it('renders a weekly RRULE in human terms', () => {
    expect(describeRecurrence('FREQ=WEEKLY;BYDAY=TH')).toBe('Every Thursday')
    expect(describeRecurrence('FREQ=WEEKLY;BYDAY=SU')).toBe('Every Sunday')
  })
  it('returns null for no rule', () => {
    expect(describeRecurrence(null)).toBeNull()
    expect(describeRecurrence('')).toBeNull()
  })
})

describe('nextOccurrence', () => {
  it('returns startsAt for a non-recurring gathering', () => {
    const start = '2099-06-04T18:00:00'
    const occ = nextOccurrence(start, null, new Date('2099-01-01T00:00:00'))
    expect(occ?.toISOString()).toBe(new Date(start).toISOString())
  })

  it('advances a weekly recurrence past start to the next future occurrence', () => {
    // 2020-01-02 is a Thursday; now is 2020-01-10 (Friday). +7 → Jan 9 (still
    // before now) → +7 → Jan 16.
    const occ = nextOccurrence(
      '2020-01-02T18:00:00',
      'FREQ=WEEKLY;BYDAY=TH',
      new Date('2020-01-10T00:00:00'),
    )
    expect(occ?.toISOString()).toBe(new Date('2020-01-16T18:00:00').toISOString())
  })

  it('keeps a future-dated recurrence at its start', () => {
    const occ = nextOccurrence(
      '2099-06-04T18:00:00',
      'FREQ=WEEKLY;BYDAY=TH',
      new Date('2099-01-01T00:00:00'),
    )
    expect(occ?.toISOString()).toBe(new Date('2099-06-04T18:00:00').toISOString())
  })

  it('returns null when there is no start time (open meetup)', () => {
    expect(nextOccurrence(null, null, new Date())).toBeNull()
  })
})

// Chainable Supabase stub (mirrors resolve-product.test.ts).
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

function gatheringRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    title: 'Thursday Run Club',
    description: 'Easy 5k, all paces.',
    brand_label: "Drake's Brews and Bites",
    member_id: 'mem-sam',
    item_gatherings: {
      starts_at: '2099-06-04T18:00:00+00:00',
      ends_at: null,
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=TH',
      capacity: 30,
      cost_cents: null,
      what_to_bring: 'Water + shoes',
    },
    owner: { handle: 'sam', display_name: 'Sam Rivera' },
    item_locations: [{ removed_at: null, locations: { label: "Drake's" } }],
    ...overrides,
  }
}

describe('resolveGathering — group path (T095 Group-attribution)', () => {
  it('attributes to the Group (kind=group, name=brand_label)', async () => {
    const supabase = makeSupabase({
      groups: { data: { id: 'g1', name: 'Repair Cafe Regulars' } },
      item_locations: { data: [{ removed_at: null, locations: { label: 'Drake\'s' } }] },
      items: { data: [gatheringRow()] },
    })
    const result = await resolveGathering(supabase, {
      groupSlug: 'drakes-a1',
      itemSlug: 'thursday-run-club-deadbeef',
    })
    expect(result).not.toBeNull()
    expect(result!.itemId).toBe(ITEM_ID)
    expect(result!.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=TH')
    expect(result!.capacity).toBe(30)
    expect(result!.costCents).toBeNull()
    expect(result!.whatToBring).toBe('Water + shoes')
    expect(result!.attribution).toEqual({ kind: 'group', name: "Drake's Brews and Bites" })
    expect(result!.location).toEqual({ label: "Drake's" })
  })

  it('falls back to the Group name when a Group-filed gathering has no brand_label (T119)', async () => {
    const supabase = makeSupabase({
      groups: { data: { id: 'g1', name: 'Repair Cafe Regulars' } },
      item_locations: { data: [{ removed_at: null, locations: { label: 'Drake\'s' } }] },
      items: { data: [gatheringRow({ brand_label: null })] },
    })
    const result = await resolveGathering(supabase, {
      groupSlug: 'drakes-a1',
      itemSlug: 'thursday-run-club-deadbeef',
    })
    expect(result).not.toBeNull()
    expect(result!.attribution).toEqual({ kind: 'group', name: 'Repair Cafe Regulars' })
  })

  it('returns null when no row id matches the slug fragment', async () => {
    const supabase = makeSupabase({
      groups: { data: { id: 'g1', name: 'Repair Cafe Regulars' } },
      item_locations: { data: [{ removed_at: null, locations: { label: 'Drake\'s' } }] },
      items: { data: [gatheringRow()] },
    })
    const result = await resolveGathering(supabase, {
      groupSlug: 'drakes-a1',
      itemSlug: 'thursday-run-club-00000000',
    })
    expect(result).toBeNull()
  })
})

// F093 criterion 8 (amended 2026-09-30) — an item's location is read on its
// own, so a signed-out caller, whom the database refuses it, still gets the item.
describe('resolveGathering — its location', () => {
  it('is not embedded in the read that finds the item', async () => {
    const supabase = makeSupabase({
      posted_item_id: { data: 'deadbeef-1111-2222-3333-444455556666' },
      items: { data: [gatheringRow({ brand_label: null })] },
    })
    await resolveGathering(supabase, { handle: 'maya', itemSlug: 'thursday-run-club-deadbeef' })
    const itemRead = read.find((r) => r.startsWith('select:id, title'))
    expect(itemRead).toBeDefined()
    expect(itemRead).not.toContain('locations(')
    expect(read).toContain('item_locations')
  })

  it('is absent, and the item still resolves, when the caller may not read it', async () => {
    const supabase = makeSupabase({
      posted_item_id: { data: 'deadbeef-1111-2222-3333-444455556666' },
      item_locations: { data: null, error: { message: 'permission denied for table locations' } },
      items: { data: [gatheringRow({ brand_label: null })] },
    })
    const result = await resolveGathering(supabase, { handle: 'maya', itemSlug: 'thursday-run-club-deadbeef' })
    expect(result).not.toBeNull()
    expect(result!.location).toBeNull()
  })
})

// #253 — an item posted without a Page resolves from the handle and id in its
// URL through posted_item_id, and names no poster: nobody reads who made it.
describe('resolveGathering — individual path', () => {
  it('resolves through posted_item_id, attributes to nobody, and reads no member column', async () => {
    const calls: unknown[] = []
    const supabase = makeSupabase({
      posted_item_id: { data: 'deadbeef-1111-2222-3333-444455556666' },
      item_locations: { data: [{ removed_at: null, locations: { label: 'Drake\'s' } }] },
      items: { data: [gatheringRow({ brand_label: null })] },
    })
    const rpc = supabase.rpc as unknown as (fn: string, args: unknown) => Promise<unknown>
    ;(supabase as unknown as { rpc: typeof rpc }).rpc = (fn: string, args: unknown) => {
      calls.push([fn, args])
      return rpc(fn, args)
    }
    const result = await resolveGathering(supabase, { handle: 'sam', itemSlug: 'thursday-run-club-deadbeef' })
    expect(result).not.toBeNull()
    expect(result!.attribution).toEqual({ kind: 'none' })
    expect(calls).toContainEqual(['posted_item_id', { p_handle: 'sam', p_kind: 'gathering', p_id_prefix: 'deadbeef' }])
    expect(read).not.toContain('members')
    expect(read).not.toContain('post_author_public')
    expect(read.filter((r) => /^(select|eq):/.test(r) && /\bmember_id\b/.test(r))).toEqual([])
  })

  it('returns null when the URL names no item', async () => {
    const supabase = makeSupabase({ posted_item_id: { data: null }, items: { data: [] } })
    expect(await resolveGathering(supabase, { handle: 'sam', itemSlug: 'thursday-run-club-deadbeef' })).toBeNull()
  })
})

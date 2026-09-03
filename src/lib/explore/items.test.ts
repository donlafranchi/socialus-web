// T117 — Explore read helper over the discoverable_items MV.

import { describe, it, expect, vi } from 'vitest'
import {
  EXPLORE_SELECT,
  mapExploreRow,
  fetchExploreItems,
  searchExploreItems,
  exploreCategoryOptions,
  type ExploreItem,
} from './items'

const GOOD_MARKET = '0101000020E6100000C3F5285C8F7A5EC0713D0AD7A3A04340'

const row = {
  item_id: 'a0000001-0000-4000-8000-000000000001',
  member_handle: 'maya-okonkwo',
  member_display_name: 'Maya Okonkwo',
  item_kind: 'product',
  title: 'Country Sourdough Loaf',
  description: 'Naturally leavened.',
  category: 'food',
  brand_label: 'The Good Loaf',
  group_id: '40000000-0000-4000-8000-000000000001',
  nearest_location_label: 'The Good Market',
  nearest_location_geography: GOOD_MARKET,
  response_count: '3',
  primary_tag: 'bread',
  photo_url: null,
  starts_at: null,
  published_at: '2026-07-26T14:33:36.769471+00:00',
}

/** Minimal chainable PostgREST double that records what was asked of it. */
function fakeClient(rows: unknown[]) {
  const calls: { table?: string; select?: string; eq?: [string, unknown][]; order?: string; limit?: number } = { eq: [] }
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = vi.fn((s: string) => { calls.select = s; return chain() })
  builder.eq = vi.fn((c: string, v: unknown) => { calls.eq!.push([c, v]); return chain() })
  builder.order = vi.fn((c: string) => { calls.order = c; return chain() })
  builder.limit = vi.fn((n: number) => { calls.limit = n; return Promise.resolve({ data: rows, error: null }) })
  const client = { from: vi.fn((t: string) => { calls.table = t; return builder }) }
  return { client: client as never, calls }
}

function item(over: Partial<ExploreItem> = {}): ExploreItem {
  return { ...mapExploreRow(row as never), ...over }
}

describe('T117 — mapExploreRow', () => {
  it('maps MV columns onto the FeedItem shape ItemFeedCard already consumes', () => {
    const m = mapExploreRow(row as never)
    expect(m.itemId).toBe(row.item_id)
    expect(m.kind).toBe('product')
    expect(m.title).toBe('Country Sourdough Loaf')
    expect(m.ownerHandle).toBe('maya-okonkwo')
    expect(m.ownerDisplayName).toBe('Maya Okonkwo')
    expect(m.brandLabel).toBe('The Good Loaf')
    expect(m.nearestLocationLabel).toBe('The Good Market')
    expect(m.category).toBe('food')
    expect(m.primaryTag).toBe('bread')
    expect(m.publishedAt).toBe(row.published_at)
  })

  it('coerces response_count from a PostgREST bigint string to a number', () => {
    expect(mapExploreRow(row as never).responseCount).toBe(3)
    expect(mapExploreRow({ ...row, response_count: null } as never).responseCount).toBe(0)
  })

  it('decodes the nearest-location geography into map coordinates', () => {
    const m = mapExploreRow(row as never)
    expect(m.longitude).toBeCloseTo(-121.915, 6)
    expect(m.latitude).toBeCloseTo(39.255, 6)
  })

  it('leaves coordinates null when the item has no approved location', () => {
    const m = mapExploreRow({ ...row, nearest_location_geography: null } as never)
    expect(m.longitude).toBeNull()
    expect(m.latitude).toBeNull()
  })
})

describe('T117 — fetchExploreItems', () => {
  it('reads the discoverable_items MV, newest first', async () => {
    const { client, calls } = fakeClient([row])
    const items = await fetchExploreItems(client, {})
    expect(calls.table).toBe('discoverable_items')
    expect(calls.select).toBe(EXPLORE_SELECT)
    expect(calls.order).toBe('published_at')
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Country Sourdough Loaf')
  })

  it('sends no kind predicate for the All pill', async () => {
    const { client, calls } = fakeClient([row])
    await fetchExploreItems(client, { kind: null })
    expect(calls.eq).toEqual([])
  })

  it('filters server-side on item_kind when a pill is selected', async () => {
    const { client, calls } = fakeClient([])
    await fetchExploreItems(client, { kind: 'gathering' })
    expect(calls.eq).toEqual([['item_kind', 'gathering']])
  })

  it('returns [] rather than throwing when the read errors', async () => {
    const client = {
      from: () => ({
        select: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }),
        }),
      }),
    }
    await expect(fetchExploreItems(client as never, {})).resolves.toEqual([])
  })
})

describe('T117 — searchExploreItems', () => {
  const bread = item({ itemId: '1', title: 'Country Sourdough Loaf', category: 'food' })
  const bike = item({
    itemId: '2', title: 'Saturday Bike Tune-Up', kind: 'service', category: 'repair',
    brandLabel: null, ownerDisplayName: 'Theo Brandt', nearestLocationLabel: 'Pond Side Commons',
    description: 'Gears and brakes.',
  })
  const all = [bread, bike]

  it('returns everything with no query and no category', () => {
    expect(searchExploreItems(all, {})).toHaveLength(2)
  })

  it('matches title case-insensitively', () => {
    expect(searchExploreItems(all, { q: 'sourdough' }).map((i) => i.itemId)).toEqual(['1'])
  })

  it('matches description, owner, brand, location, and category', () => {
    expect(searchExploreItems(all, { q: 'brakes' }).map((i) => i.itemId)).toEqual(['2'])
    expect(searchExploreItems(all, { q: 'theo' }).map((i) => i.itemId)).toEqual(['2'])
    expect(searchExploreItems(all, { q: 'good loaf' }).map((i) => i.itemId)).toEqual(['1'])
    expect(searchExploreItems(all, { q: 'pond side' }).map((i) => i.itemId)).toEqual(['2'])
    expect(searchExploreItems(all, { q: 'repair' }).map((i) => i.itemId)).toEqual(['2'])
  })

  it('ignores surrounding whitespace', () => {
    expect(searchExploreItems(all, { q: '   ' })).toHaveLength(2)
    expect(searchExploreItems(all, { q: '  bike  ' })).toHaveLength(1)
  })

  it('filters by category', () => {
    expect(searchExploreItems(all, { category: 'repair' }).map((i) => i.itemId)).toEqual(['2'])
    expect(searchExploreItems(all, { category: 'nope' })).toHaveLength(0)
  })

  it('applies query and category together', () => {
    expect(searchExploreItems(all, { q: 'bike', category: 'food' })).toHaveLength(0)
  })
})

describe('T117 — exploreCategoryOptions', () => {
  it('lists the distinct categories present, sorted, dropping nulls', () => {
    const items = [
      item({ itemId: '1', category: 'repair' }),
      item({ itemId: '2', category: 'food' }),
      item({ itemId: '3', category: 'food' }),
      item({ itemId: '4', category: null }),
    ]
    expect(exploreCategoryOptions(items)).toEqual(['food', 'repair'])
  })

  it('is empty for an empty result set', () => {
    expect(exploreCategoryOptions([])).toEqual([])
  })
})

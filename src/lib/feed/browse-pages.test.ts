// T154 (#51) — the Page-grain browse read helper.

import { describe, it, expect, vi } from 'vitest'
import { getBrowsePages, type BrowsePageRow } from './browse-pages'

vi.mock('./group-prefixes', () => ({
  // The prefix attach is T119's and already tested; stub it so these tests
  // cover the projection rather than re-testing the batch.
  attachGroupPrefixes: (_c: unknown, rows: unknown[]) => Promise.resolve(rows),
}))

const ROW: BrowsePageRow = {
  group_id: 'g1',
  slug: 'folsom-coffee',
  name: 'Folsom Coffee',
  category: 'Food & Drink',
  description: 'Roasters on Sutter Street.',
  photo_url: 'https://example.test/a.webp',
  anchor_location_id: 'l1',
  anchor_location_label: 'Sutter Street',
  // EWKB point, little-endian, SRID 4326 — lon -121, lat 38.
  anchor_location_geography:
    '0101000020E6100000000000000040' + '5EC0' + '0000000000004340',
  updated_at: '2026-09-12T00:00:00.000Z',
}

function client(rows: unknown[] = [ROW], error: unknown = null) {
  return { rpc: vi.fn(() => Promise.resolve({ data: rows, error })) } as never
}

describe('T154 — getBrowsePages projection', () => {
  it('maps every column the function returns', async () => {
    const [page] = await getBrowsePages(client(), { placeId: 'p1' })
    expect(page).toMatchObject({
      groupId: 'g1',
      slug: 'folsom-coffee',
      name: 'Folsom Coffee',
      category: 'Food & Drink',
      description: 'Roasters on Sutter Street.',
      photoUrl: 'https://example.test/a.webp',
      anchorLocationId: 'l1',
      anchorLocationLabel: 'Sutter Street',
      updatedAt: '2026-09-12T00:00:00.000Z',
    })
  })

  it('decodes the anchor geography to a map pin', async () => {
    const [page] = await getBrowsePages(client(), { placeId: 'p1' })
    expect(page.longitude).toBeCloseTo(-121, 6)
    expect(page.latitude).toBeCloseTo(38, 6)
  })

  it('decodes a null geography to null lon/lat without throwing', async () => {
    const [page] = await getBrowsePages(
      client([{ ...ROW, anchor_location_geography: null }]),
      { placeId: 'p1' },
    )
    expect(page.longitude).toBeNull()
    expect(page.latitude).toBeNull()
  })

  it('survives an unparseable geography rather than failing the whole page', async () => {
    const [page] = await getBrowsePages(
      client([{ ...ROW, anchor_location_geography: 'not-ewkb' }]),
      { placeId: 'p1' },
    )
    expect(page.longitude).toBeNull()
    expect(page.groupId).toBe('g1')
  })

  it('returns an empty list for an empty result, not null', async () => {
    expect(await getBrowsePages(client([]), { placeId: 'p1' })).toEqual([])
  })

  it('throws on an RPC error rather than returning a silently empty page', async () => {
    await expect(
      getBrowsePages(client([], { message: 'boom' }), { placeId: 'p1' }),
    ).rejects.toBeTruthy()
  })
})

describe('T154 — parameters', () => {
  const argsOf = (c: unknown) =>
    (c as { rpc: { mock: { calls: unknown[][] } } }).rpc.mock.calls[0]

  it('calls browse_pages with the place and the clamped limit', async () => {
    const c = client()
    await getBrowsePages(c, { placeId: 'p1' })
    const [fn, args] = argsOf(c)
    expect(fn).toBe('browse_pages')
    expect(args).toMatchObject({ p_place_id: 'p1', p_limit: 50 })
  })

  it('sends null for an omitted category rather than omitting the key', async () => {
    const c = client()
    await getBrowsePages(c, { placeId: 'p1' })
    expect(argsOf(c)[1]).toMatchObject({ p_category: null })
  })

  it('forwards a category verbatim', async () => {
    const c = client()
    await getBrowsePages(c, { placeId: 'p1', category: 'Growing' })
    expect(argsOf(c)[1]).toMatchObject({ p_category: 'Growing' })
  })

  it('clamps the limit into 1..100', async () => {
    const hi = client()
    await getBrowsePages(hi, { placeId: 'p1', limit: 5000 })
    expect(argsOf(hi)[1]).toMatchObject({ p_limit: 100 })
    const lo = client()
    await getBrowsePages(lo, { placeId: 'p1', limit: 0 })
    expect(argsOf(lo)[1]).toMatchObject({ p_limit: 1 })
  })

  it('takes no interest-tag parameter at all', async () => {
    // Browse is complete and unranked by member interest (ruled 2026-09-12).
    // Asserted on the call shape so a tag boost cannot be added here quietly
    // — it would have to change this test, which names the ruling.
    const c = client()
    await getBrowsePages(c, { placeId: 'p1' })
    expect(Object.keys(argsOf(c)[1] as object)).not.toContain('p_tags')
  })
})

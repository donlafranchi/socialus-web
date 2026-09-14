// T162 (#75) — the post-grain browse read helper.
//
// Mirrors browse-pages.test.ts, because the two sources are meant to be
// read the same way. Where this one differs, the difference is the ticket:
// a post's free text, its OPTIONAL start time, and its OWN geography.

import { describe, it, expect, vi } from 'vitest'
import { getBrowsePosts, type BrowsePostRow } from './browse-posts'

vi.mock('./group-prefixes', () => ({
  // T119's batch, already tested. Stubbed so these cover the projection.
  attachGroupPrefixes: (_c: unknown, rows: unknown[]) => Promise.resolve(rows),
}))

const ROW: BrowsePostRow = {
  post_id: 'po1',
  group_id: 'g1',
  slug: 'folsom-coffee',
  name: 'Folsom Coffee',
  photo_url: 'https://example.test/a.webp',
  body: 'Sourdough is back Thursday.',
  starts_at: null,
  location_id: 'l1',
  location_label: 'Sutter Street',
  // EWKB point, little-endian, SRID 4326 — lon -121, lat 38.
  location_geography: '0101000020E6100000000000000040' + '5EC0' + '0000000000004340',
  created_at: '2026-09-12T00:00:00.000Z',
  updated_at: '2026-09-12T00:00:00.000Z',
}

function client(rows: unknown[] = [ROW], error: unknown = null) {
  return { rpc: vi.fn(() => Promise.resolve({ data: rows, error })) } as never
}

describe('T162 — getBrowsePosts projection', () => {
  it('maps every column the function returns', async () => {
    const [post] = await getBrowsePosts(client(), { placeId: 'p1' })
    expect(post).toMatchObject({
      postId: 'po1',
      groupId: 'g1',
      slug: 'folsom-coffee',
      name: 'Folsom Coffee',
      photoUrl: 'https://example.test/a.webp',
      body: 'Sourdough is back Thursday.',
      startsAt: null,
      locationId: 'l1',
      locationLabel: 'Sutter Street',
      createdAt: '2026-09-12T00:00:00.000Z',
      updatedAt: '2026-09-12T00:00:00.000Z',
    })
  })

  it("decodes the post's own geography to a map pin", async () => {
    const [post] = await getBrowsePosts(client(), { placeId: 'p1' })
    expect(post.longitude).toBeCloseTo(-121, 6)
    expect(post.latitude).toBeCloseTo(38, 6)
  })

  it('decodes a null geography to null lon/lat without throwing', async () => {
    const [post] = await getBrowsePosts(
      client([{ ...ROW, location_geography: null, location_id: null, location_label: null }]),
      { placeId: 'p1' },
    )
    expect(post.longitude).toBeNull()
    expect(post.latitude).toBeNull()
    expect(post.locationId).toBeNull()
  })

  it('survives an unparseable geography rather than failing the whole post', async () => {
    const [post] = await getBrowsePosts(
      client([{ ...ROW, location_geography: 'not-ewkb' }]),
      { placeId: 'p1' },
    )
    expect(post.longitude).toBeNull()
    expect(post.postId).toBe('po1')
  })

  it('round-trips a null start time as null, never a sentinel date', async () => {
    // An undated post is a first-class post, not a degraded event. A sentinel
    // here would make it sort and filter as though it had a time.
    const [post] = await getBrowsePosts(client(), { placeId: 'p1' })
    expect(post.startsAt).toBeNull()
    expect(post.startsAt).not.toBe('')
    expect(post.startsAt).not.toBe(0)
  })

  it('forwards a present start time verbatim', async () => {
    const [post] = await getBrowsePosts(
      client([{ ...ROW, starts_at: '2026-09-19T17:00:00.000Z' }]),
      { placeId: 'p1' },
    )
    expect(post.startsAt).toBe('2026-09-19T17:00:00.000Z')
  })

  it('returns an empty list for an empty result, not null', async () => {
    expect(await getBrowsePosts(client([]), { placeId: 'p1' })).toEqual([])
  })

  it('throws on an RPC error rather than returning a silently empty page', async () => {
    await expect(
      getBrowsePosts(client([], { message: 'boom' }), { placeId: 'p1' }),
    ).rejects.toBeTruthy()
  })
})

describe('T162 — parameters', () => {
  const argsOf = (c: unknown) =>
    (c as { rpc: { mock: { calls: unknown[][] } } }).rpc.mock.calls[0]

  it('calls browse_posts with the place and the clamped limit', async () => {
    const c = client()
    await getBrowsePosts(c, { placeId: 'p1' })
    const [fn, args] = argsOf(c)
    expect(fn).toBe('browse_posts')
    expect(args).toMatchObject({ p_place_id: 'p1', p_limit: 50 })
  })

  it('sends null for an omitted now-cutoff rather than omitting the key', async () => {
    const c = client()
    await getBrowsePosts(c, { placeId: 'p1' })
    expect(argsOf(c)[1]).toMatchObject({ p_now: null })
  })

  it('forwards an explicit cutoff verbatim', async () => {
    const c = client()
    await getBrowsePosts(c, { placeId: 'p1', now: '2026-09-14T00:00:00.000Z' })
    expect(argsOf(c)[1]).toMatchObject({ p_now: '2026-09-14T00:00:00.000Z' })
  })

  it('clamps the limit into 1..100', async () => {
    const hi = client()
    await getBrowsePosts(hi, { placeId: 'p1', limit: 5000 })
    expect(argsOf(hi)[1]).toMatchObject({ p_limit: 100 })
    const lo = client()
    await getBrowsePosts(lo, { placeId: 'p1', limit: 0 })
    expect(argsOf(lo)[1]).toMatchObject({ p_limit: 1 })
  })

  it('takes no interest-tag parameter at all', async () => {
    // Browse is complete and unranked by member interest (ruled 2026-09-12).
    const c = client()
    await getBrowsePosts(c, { placeId: 'p1' })
    expect(Object.keys(argsOf(c)[1] as object)).not.toContain('p_tags')
  })

  it('takes no category parameter — categories are retired', async () => {
    // Tags are the only vocabulary (ruled 2026-09-13). browse_pages still
    // carries p_category from before that ruling; this source must not
    // inherit it.
    const c = client()
    await getBrowsePosts(c, { placeId: 'p1' })
    expect(Object.keys(argsOf(c)[1] as object)).not.toContain('p_category')
  })
})

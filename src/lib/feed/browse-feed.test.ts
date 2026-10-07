// T156 — the browse read helper. One query, Pages and posts together.

import { describe, it, expect, vi } from 'vitest'
import { getBrowseFeed, type BrowseFeedRow, resultHref } from './browse-feed'

// EWKB point, little-endian, SRID 4326 — lon -121, lat 38.
const POINT = '0101000020E6100000000000000040' + '5EC0' + '0000000000004340'

const PAGE_ROW: BrowseFeedRow = {
  result_kind: 'page',
  result_id: 'g1',
  group_id: 'g1',
  group_kind: 'business',
  slug: 'folsom-coffee',
  name: 'Folsom Coffee',
  place_path: 'ca/sacramento/folsom',
  photo_url: 'https://example.test/a.webp',
  photo_hidden_at: null,
  photo_removed_at: null,
  description: 'Roasters on Sutter Street.',
  body: null,
  tags: ['coffee', 'local food'],
  starts_at: null,
  location_id: 'l1',
  location_label: 'Sutter Street',
  location_geography: POINT,
  page_created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-12T00:00:00.000Z',
  posted_at: null,
  sort_at: '2026-09-12T00:00:00.000Z',
}

const POST_ROW: BrowseFeedRow = {
  ...PAGE_ROW,
  result_kind: 'post',
  result_id: 'pp1',
  body: 'Sourdough is back Thursday.',
  description: null,
  starts_at: '2026-09-24T17:00:00.000Z',
}

// Issue #175 — the href is the canonical address now, so the stub answers the
// second read that resolves it: the Pages' public ids, keyed by group id.
function client(
  rows: unknown[] = [PAGE_ROW],
  error: unknown = null,
  handles: unknown[] = [{ id: 'g1', slug: 'folsom-coffee', public_id: '7k3x8m' }],
) {
  return {
    rpc: vi.fn(() => Promise.resolve({ data: rows, error })),
    from: vi.fn(() => ({
      select: () => ({ in: () => Promise.resolve({ data: handles, error: null }) }),
    })),
  }
}

function argsOf(c: ReturnType<typeof client>) {
  return (c.rpc as unknown as { mock: { calls: [string, Record<string, unknown>][] } }).mock
    .calls[0][1]
}

describe('T156 — getBrowseFeed projection', () => {
  it('maps a Page row, including the kind and the tags', async () => {
    const [row] = await getBrowseFeed(client() as never, { scope: { metroId: 'm1' } })
    expect(row).toMatchObject({
      resultKind: 'page',
      resultId: 'g1',
      groupId: 'g1',
      groupKind: 'business',
      slug: 'folsom-coffee',
      name: 'Folsom Coffee',
      description: 'Roasters on Sutter Street.',
      body: null,
      tags: ['coffee', 'local food'],
      locationLabel: 'Sutter Street',
      pageCreatedAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-12T00:00:00.000Z',
      sortAt: '2026-09-12T00:00:00.000Z',
    })
  })

  it('maps a post row, carrying its own body and start time', async () => {
    const [row] = await getBrowseFeed(client([POST_ROW]) as never, { scope: { metroId: 'm1' } })
    expect(row).toMatchObject({
      resultKind: 'post',
      resultId: 'pp1',
      body: 'Sourdough is back Thursday.',
      startsAt: '2026-09-24T17:00:00.000Z',
    })
  })

  it('links to the canonical address, which carries no place path (#175)', async () => {
    const [row] = await getBrowseFeed(client() as never, { scope: { metroId: 'm1' } })
    expect(row.href).toBe('/g/7k3x8m')
  })

  it('still links when the place path did not resolve — that null was the bug', async () => {
    // Every member-created Page had a null place_path, and every card built
    // from one was dead. The address no longer depends on it.
    const [row] = await getBrowseFeed(
      client([{ ...PAGE_ROW, place_path: null }]) as never,
      { scope: { metroId: 'm1' } },
    )
    expect(row.href).toBe('/g/7k3x8m')
  })

  it('leaves href null when the Page has no public id to resolve by', async () => {
    const [row] = await getBrowseFeed(
      client([PAGE_ROW], null, []) as never,
      { scope: { metroId: 'm1' } },
    )
    expect(row.href).toBeNull()
  })

  it('reads the public ids once for the whole result set, not once per row', async () => {
    const c = client([PAGE_ROW, { ...POST_ROW, result_id: 'pp2' }])
    await getBrowseFeed(c as never, { scope: { metroId: 'm1' } })
    expect(c.from).toHaveBeenCalledTimes(1)
  })

  it('does not read at all when the feed is empty', async () => {
    const c = client([])
    await getBrowseFeed(c as never, { scope: { metroId: 'm1' } })
    expect(c.from).not.toHaveBeenCalled()
  })

  it('decodes the geography to a map pin', async () => {
    const [row] = await getBrowseFeed(client() as never, { scope: { metroId: 'm1' } })
    expect(row.longitude).toBeCloseTo(-121, 6)
    expect(row.latitude).toBeCloseTo(38, 6)
  })

  it('decodes a null geography to null lon/lat without throwing', async () => {
    const [row] = await getBrowseFeed(
      client([{ ...PAGE_ROW, location_geography: null }]) as never,
      { scope: { metroId: 'm1' } },
    )
    expect(row.longitude).toBeNull()
    expect(row.latitude).toBeNull()
  })

  it('a bad point loses its pin, never the row', async () => {
    const [row] = await getBrowseFeed(
      client([{ ...PAGE_ROW, location_geography: 'not-ewkb' }]) as never,
      { scope: { metroId: 'm1' } },
    )
    expect(row.resultId).toBe('g1')
    expect(row.longitude).toBeNull()
  })

  it('withholds a hidden photo, and a removed one', async () => {
    const [hidden] = await getBrowseFeed(
      client([{ ...PAGE_ROW, photo_hidden_at: '2026-09-17T00:00:00.000Z' }]) as never,
      { scope: { metroId: 'm1' } },
    )
    expect(hidden.photoUrl).toBeNull()

    const [removed] = await getBrowseFeed(
      client([{ ...PAGE_ROW, photo_removed_at: '2026-09-17T00:00:00.000Z' }]) as never,
      { scope: { metroId: 'm1' } },
    )
    expect(removed.photoUrl).toBeNull()
  })

  it('normalises a null tag array to an empty one', async () => {
    const [row] = await getBrowseFeed(
      client([{ ...PAGE_ROW, tags: null }]) as never,
      { scope: { metroId: 'm1' } },
    )
    expect(row.tags).toEqual([])
  })

  it('throws on a read error rather than reporting an empty result set', async () => {
    await expect(
      getBrowseFeed(client([], { message: 'boom' }) as never, { scope: { metroId: 'm1' } }),
    ).rejects.toMatchObject({ message: 'boom' })
  })
})

describe('T156 — the parameters getBrowseFeed sends', () => {
  it('scopes by metro, leaving the place null', async () => {
    const c = client()
    await getBrowseFeed(c as never, { scope: { metroId: 'm1' } })
    expect(argsOf(c)).toMatchObject({ p_metro_id: 'm1', p_place_id: null })
  })

  it('scopes by place, leaving the metro null', async () => {
    const c = client()
    await getBrowseFeed(c as never, { scope: { placeId: 'p1' } })
    expect(argsOf(c)).toMatchObject({ p_metro_id: null, p_place_id: 'p1' })
  })

  it('omitted optional filters are sent as null, never as a guessed default', async () => {
    const c = client()
    await getBrowseFeed(c as never, { scope: { metroId: 'm1' } })
    expect(argsOf(c)).toMatchObject({
      p_kinds: null,
      p_result_kinds: null,
      p_tags: null,
      p_starts_from: null,
      p_starts_before: null,
      p_created_after: null,
      p_now: null,
    })
  })

  it('forwards a kind filter verbatim — no kind is ever baked in', async () => {
    const c = client()
    await getBrowseFeed(c as never, {
      scope: { metroId: 'm1' },
      kinds: ['business', 'interest'],
    })
    expect(argsOf(c).p_kinds).toEqual(['business', 'interest'])
  })

  it('forwards the lens parameters, normalising tags to the vocabulary key', async () => {
    const c = client()
    await getBrowseFeed(c as never, {
      scope: { metroId: 'm1' },
      resultKinds: ['post'],
      tags: ['Local Food'],
      startsFrom: '2026-09-19T00:00:00.000Z',
      startsBefore: '2026-09-20T00:00:00.000Z',
      createdAfter: '2026-09-05T00:00:00.000Z',
      sort: 'soonest',
      now: '2026-09-19T12:00:00.000Z',
    })
    expect(argsOf(c)).toMatchObject({
      p_result_kinds: ['post'],
      p_tags: ['local food'],  // normalised on the way out
      p_starts_from: '2026-09-19T00:00:00.000Z',
      p_starts_before: '2026-09-20T00:00:00.000Z',
      p_created_after: '2026-09-05T00:00:00.000Z',
      p_sort: 'soonest',
      p_now: '2026-09-19T12:00:00.000Z',
    })
  })

  it('defaults to the public audience and sends no follow set', async () => {
    const c = client()
    await getBrowseFeed(c as never, { scope: { metroId: 'm1' } })
    expect(argsOf(c)).toMatchObject({ p_audience: 'public', p_following: null })
  })

  it('asks for the following audience only with the set in hand', async () => {
    const c = client()
    await getBrowseFeed(c as never, {
      scope: { metroId: 'm1' },
      audience: { audience: 'following', following: ['g1', 'g2'] },
    })
    expect(argsOf(c)).toMatchObject({ p_audience: 'following', p_following: ['g1', 'g2'] })
  })

  // The signed-out case, and the signed-in-but-follows-nothing case, are the
  // same call: an empty set. It must reach the database as an empty array and
  // not as null, because null on the public path means "no restriction".
  it('sends an empty follow set as an empty array, never as null', async () => {
    const c = client()
    await getBrowseFeed(c as never, {
      scope: { metroId: 'm1' },
      audience: { audience: 'following', following: [] },
    })
    expect(argsOf(c)).toMatchObject({ p_audience: 'following', p_following: [] })
  })

  it('clamps the limit the way every other feed read does', async () => {
    const c = client()
    await getBrowseFeed(c as never, { scope: { metroId: 'm1' }, limit: 5000 })
    expect(argsOf(c).p_limit).toBe(100)
  })
})

// bug #211 — an announcement card links to its announcement.
describe('resultHref', () => {
  const row = (over: Record<string, unknown> = {}) =>
    ({ slug: 'sacriver-floaters', result_kind: 'post', result_id: 'p-1', ...over }) as never

  it('sends an announcement to its own fragment on the Page', () => {
    expect(resultHref(row(), 'abc123')).toBe('/g/abc123#announcement-p-1')
  })

  it('sends a Page to its Page, with no fragment', () => {
    expect(resultHref(row({ result_kind: 'page' }), 'abc123')).toBe('/g/abc123')
  })

  it('is null when the Page has no address — never a bare fragment', () => {
    // A bare '#announcement-…' is a link that looks live and goes nowhere,
    // which is worse than the card having no link at all.
    expect(resultHref(row(), null)).toBeNull()
    // #411 — the id alone is the address, so a Page with no slug still has one.
    expect(resultHref(row({ slug: null }), 'abc123')).toBe('/g/abc123#announcement-p-1')
  })
})

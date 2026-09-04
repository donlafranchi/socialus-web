// T119 — Group URL prefix batching (F054).

import { describe, it, expect, vi } from 'vitest'
import { fetchGroupPrefixes, attachGroupPrefixes, filterBrowsable } from './group-prefixes'

const G1 = '40000000-0000-4000-8000-000000000001'
const G2 = '40000000-0000-4000-8000-000000000003'

function rpcClient(rows: unknown[] | null, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data: rows, error }))
  return { client: { rpc } as never, rpc }
}

function item(over: Record<string, unknown> = {}) {
  return {
    itemId: 'a0000001-0000-4000-8000-000000000001',
    kind: 'product',
    title: 'Country Sourdough Loaf',
    groupId: null as string | null,
    ownerHandle: 'maya',
    ...over,
  }
}

describe('T119 — fetchGroupPrefixes', () => {
  it('returns an empty map and makes no call when there are no Group ids', async () => {
    const { client, rpc } = rpcClient([])
    const map = await fetchGroupPrefixes(client, [])
    expect(map.size).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends the distinct Group ids in one call', async () => {
    const { client, rpc } = rpcClient([])
    await fetchGroupPrefixes(client, [G1, G2, G1, G1])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('group_url_prefixes', { p_group_ids: [G1, G2] })
  })

  it('maps a complete row to its slug and place path', async () => {
    const { client } = rpcClient([
      { group_id: G1, slug: 'the-good-loaf', place_path: 'tgp/the-good-place/market-square' },
    ])
    const map = await fetchGroupPrefixes(client, [G1])
    expect(map.get(G1)).toEqual({
      slug: 'the-good-loaf',
      placePath: 'tgp/the-good-place/market-square',
    })
  })

  it('omits a Group whose place path is null rather than storing a partial prefix', async () => {
    const { client } = rpcClient([{ group_id: G1, slug: 'the-good-loaf', place_path: null }])
    const map = await fetchGroupPrefixes(client, [G1])
    expect(map.has(G1)).toBe(false)
  })

  it('degrades to an empty map on RPC error rather than throwing', async () => {
    const { client } = rpcClient(null, { message: 'boom' })
    await expect(fetchGroupPrefixes(client, [G1])).resolves.toEqual(new Map())
  })
})

describe('T119 — attachGroupPrefixes', () => {
  it('attaches slug and place path to Group-filed items only', async () => {
    const { client } = rpcClient([
      { group_id: G1, slug: 'the-good-loaf', place_path: 'tgp/the-good-place' },
    ])
    const out = await attachGroupPrefixes(client, [
      item({ groupId: G1 }),
      item({ itemId: 'b', groupId: null }),
    ])
    expect(out[0].groupSlug).toBe('the-good-loaf')
    expect(out[0].groupPlacePath).toBe('tgp/the-good-place')
    expect(out[1].groupSlug).toBeNull()
    expect(out[1].groupPlacePath).toBeNull()
  })

  it('leaves a Group-filed item unprefixed when its Group has no place path', async () => {
    const { client } = rpcClient([{ group_id: G2, slug: 'repair-cafe-regulars', place_path: null }])
    const out = await attachGroupPrefixes(client, [item({ groupId: G2 })])
    expect(out[0].groupSlug).toBeNull()
  })

  it('makes no call when nothing is Group-filed', async () => {
    const { client, rpc } = rpcClient([])
    await attachGroupPrefixes(client, [item(), item({ itemId: 'b' })])
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('T119 — filterBrowsable', () => {
  it('drops the four kinds with no detail page', () => {
    const items = [
      item({ kind: 'product' }),
      item({ kind: 'service' }),
      item({ kind: 'gathering' }),
      item({ kind: 'wonder' }),
      item({ kind: 'offer' }),
      item({ kind: 'ask' }),
      item({ kind: 'initiative' }),
    ]
    expect(filterBrowsable(items).map((i) => i.kind)).toEqual([
      'product',
      'service',
      'gathering',
    ])
  })
})

// #475 — browse_feed returns a location id but not its kind; the map needs to
// know whether a row is an exact address or only an area.

import { describe, it, expect, vi } from 'vitest'
import { withLocationKinds } from './location-kinds'

const rows = [
  { resultId: 'a', locationId: 'l1' },
  { resultId: 'b', locationId: 'l2' },
  { resultId: 'c', locationId: null },
] as never[]

const client = (data: { id: string; kind: string }[] | null, error: unknown = null) =>
  ({ from: vi.fn(() => ({ select: () => ({ in: async () => ({ data, error }) }) })) }) as never

describe('withLocationKinds', () => {
  it('stamps each row with its location kind', async () => {
    const out = await withLocationKinds(client([{ id: 'l1', kind: 'permanent' }, { id: 'l2', kind: 'area' }]), rows)
    expect(out.map((r) => (r as { locationKind?: string }).locationKind)).toEqual(['permanent', 'area', undefined])
  })

  it('asks for each location once', async () => {
    const c = client([])
    await withLocationKinds(c, [...rows, ...rows])
    const fn = (c as unknown as { from: ReturnType<typeof vi.fn> }).from
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('a failed read costs the distinction, never the map', async () => {
    const out = await withLocationKinds(client(null, { message: 'boom' }), rows)
    expect(out).toHaveLength(3)
  })

  it('nothing to look up, nothing asked', async () => {
    const c = client([])
    await withLocationKinds(c, [{ resultId: 'c', locationId: null }] as never[])
    expect((c as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled()
  })
})

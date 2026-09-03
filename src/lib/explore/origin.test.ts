// T115 — the point the distance filter measures from (F045 § bottom sheet).

import { describe, it, expect, vi } from 'vitest'
import { fetchExploreOrigin } from './origin'

const SAC = { id: 'sac', display_name: 'West Sacramento', slug: 'west-sacramento', kind: 'city' }
// EWKB for POINT(-121.53 38.58), the same encoding the MV hands back.
const CENTROID = '0101000020E610000052B81E85EB615EC00AD7A3703D4A4340'

function makeClient(centroid: string | null, opts: { placeError?: boolean } = {}) {
  const from = vi.fn((table: string) => {
    const state: { col?: string } = {}
    const b: Record<string, unknown> = {}
    b.select = () => b
    b.is = () => b
    b.eq = (col: string) => {
      state.col = col
      return b
    }
    b.maybeSingle = async () =>
      table === 'places' && state.col === 'id'
        ? { data: centroid === null ? null : { centroid }, error: null }
        : { data: null, error: null }
    b.then = (resolve: (v: unknown) => void) =>
      resolve({ data: opts.placeError ? [] : [SAC], error: null })
    return b
  })
  return { from }
}

describe('fetchExploreOrigin', () => {
  it('names the locality and decodes its centroid', async () => {
    const out = await fetchExploreOrigin(makeClient(CENTROID) as never)
    expect(out?.placeName).toBe('West Sacramento')
    expect(out?.point?.longitude).toBeCloseTo(-121.53, 4)
    expect(out?.point?.latitude).toBeCloseTo(38.58, 4)
  })

  it('still names the locality when the place carries no centroid', async () => {
    const out = await fetchExploreOrigin(makeClient(null) as never)
    expect(out?.placeName).toBe('West Sacramento')
    expect(out?.point).toBeNull()
  })

  it('returns null when no place resolves at all', async () => {
    expect(await fetchExploreOrigin(makeClient(CENTROID, { placeError: true }) as never)).toBeNull()
  })

  it('degrades to null rather than throwing when the read fails', async () => {
    const client = {
      from: () => {
        throw new Error('offline')
      },
    }
    expect(await fetchExploreOrigin(client as never)).toBeNull()
  })
})

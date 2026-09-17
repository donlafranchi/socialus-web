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

// The scope control: a chosen metro is the origin, and it beats the launch
// default outright. Only an open metro can be chosen.
describe('fetchExploreOrigin with a chosen metro', () => {
  const METRO = {
    name: 'Sacramento-Roseville, CA',
    centroid: '0101000020E610000052B81E85EB615EC00AD7A3703D4A4340',
    is_open: true,
  }

  function metroClient(row: Record<string, unknown> | null) {
    return {
      from: vi.fn((table: string) => {
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.is = () => b
        b.eq = () => b
        b.maybeSingle = async () => ({
          data: table === 'metro_polygons' ? row : { centroid: null },
          error: null,
        })
        b.then = (resolve: (v: unknown) => void) => resolve({ data: [SAC], error: null })
        return b
      }),
    }
  }

  it('names the chosen metro and measures from its centroid', async () => {
    const out = await fetchExploreOrigin(metroClient(METRO) as never, {
      metroSlug: 'sacramento-roseville-ca',
    })
    expect(out?.placeName).toBe('Sacramento-Roseville, CA')
    expect(out?.chosen).toBe(true)
    expect(out?.point?.latitude).toBeCloseTo(38.58, 4)
  })

  // 295 of 296 metros carry no centroid. Naming one would relabel the page
  // while the results underneath never moved — the lie this change undoes.
  it('refuses a metro the platform does not serve, even from a hand-typed URL', async () => {
    const out = await fetchExploreOrigin(
      metroClient({ name: 'Boise City, ID', centroid: null, is_open: false }) as never,
      { metroSlug: 'boise-city-id' },
    )
    expect(out?.placeName).toBe('West Sacramento')
    expect(out?.chosen).toBe(false)
  })

  it('falls back to the place default when the slug matches nothing', async () => {
    const out = await fetchExploreOrigin(metroClient(null) as never, { metroSlug: 'nowhere' })
    expect(out?.placeName).toBe('West Sacramento')
  })
})

// #348 — where a Page is, read for signed-in visitors (the front door shows none of it).

import { describe, it, expect, vi } from 'vitest'
import { resolvePageWhere, whereLine } from './page-where'

function supabaseWith(group: unknown, towns: unknown[] = []) {
  return {
    from: vi.fn((table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({ data: group, error: null })),
        then: (res: (v: unknown) => unknown) => res({ data: towns, error: null }),
      }
      return table === 'groups' || table === 'page_service_areas' ? chain : chain
    }),
  } as never
}

describe('#348 — resolvePageWhere', () => {
  it('reads the answer, its notes and the towns served', async () => {
    const where = await resolvePageWhere(
      supabaseWith({ where_mode: 'travel', how_to_find: null, usually_around: null }, [{ places: { id: 'pl-d', display_name: 'Davis' } }]),
      'g1',
    )
    expect(where).toEqual({ mode: 'travel', howToFind: null, usuallyAround: null, towns: [{ id: 'pl-d', name: 'Davis' }] })
  })

  it('is null when nothing was ever answered', async () => {
    expect(await resolvePageWhere(supabaseWith(null), 'g1')).toBeNull()
  })
})

describe('#348 — the line a visitor reads', () => {
  it('People come to me: how to find us', () => {
    expect(whereLine({ mode: 'visit', howToFind: 'Behind the barn', usuallyAround: null, towns: [] })).toBe('How to find us: Behind the barn')
  })
  it('I go to them, no towns: the whole metro', () => {
    expect(whereLine({ mode: 'travel', howToFind: null, usuallyAround: null, towns: [] })).toBe('Comes to you anywhere in the Sacramento area')
  })
  it('I go to them, with towns: named', () => {
    expect(whereLine({ mode: 'travel', howToFind: null, usuallyAround: null, towns: [{ id: 'a', name: 'Davis' }, { id: 'b', name: 'Woodland' }] })).toBe('Comes to you in Davis and Woodland')
  })
  it('It moves: the metro, and where it usually is', () => {
    expect(whereLine({ mode: 'roaming', howToFind: null, usuallyAround: 'Midtown markets', usuallyAroundDummy: undefined } as never)).toBe('Around the Sacramento area, usually Midtown markets')
  })
  it('nothing to say, nothing shown', () => {
    expect(whereLine({ mode: 'visit', howToFind: null, usuallyAround: null, towns: [] })).toBeNull()
  })
})

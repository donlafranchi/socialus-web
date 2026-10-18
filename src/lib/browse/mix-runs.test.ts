import { describe, expect, it } from 'vitest'
import { mixRuns } from './mix-runs'
import { sessionShuffle } from './session-shuffle'

type Row = { id: string; tags: string[]; dated?: boolean; at: string }
const opts = { tags: (r: Row) => r.tags, movable: (r: Row) => !r.dated }

function longestRun(rows: Row[]): number {
  let best = 0
  for (let i = 0; i < rows.length; i++) {
    for (const t of rows[i]!.tags) {
      let n = 0
      while (rows[i + n]?.tags.includes(t)) n++
      best = Math.max(best, n)
    }
  }
  return best
}

// A seeded day: the arts batch loaded in one moment, then the farms, as the loader does.
const day = '2026-10-15T17:19:00Z'
const batch: Row[] = [
  ...['museum', 'historical-society', 'gallery', 'theatre', 'choir', 'pottery'].map((id) => ({ id, tags: ['Arts & culture'], at: day })),
  ...['farm-a', 'farm-b', 'ranch', 'orchard'].map((id) => ({ id, tags: ['Local food', 'Farmers markets'], at: day })),
  ...['food-bank', 'repair-cafe', 'tool-library', 'fridge'].map((id) => ({ id, tags: ['Volunteering'], at: '2026-10-14T17:00:00Z' })),
]

describe('#897 mixRuns', () => {
  it('a seed batch never shows 3 in a row of one category, whatever the session seed', () => {
    for (const seed of [null, ...'abcdefghij'.split('').map((c) => c.repeat(16))]) {
      const shuffled = sessionShuffle(batch, seed, { id: (r) => r.id, at: (r) => r.at, now: new Date('2026-10-16T00:00:00Z') })
      expect(longestRun(mixRuns(shuffled, opts))).toBeLessThanOrEqual(2)
    }
  })

  it('a run is any shared tag, case-insensitive', () => {
    const rows: Row[] = [
      { id: '1', tags: ['Arts & culture', 'Kids & family'], at: day },
      { id: '2', tags: ['arts & culture'], at: day },
      { id: '3', tags: ['Arts & culture', 'Gardening'], at: day },
      { id: '4', tags: ['Fitness & outdoors'], at: day },
    ]
    expect(mixRuns(rows, opts).map((r) => r.id)).toEqual(['1', '2', '4', '3'])
  })

  it('leaves an already mixed list exactly as it was, and drops nothing', () => {
    const rows: Row[] = ['a', 'b', 'a', 'b', 'c', 'c', 'a'].map((t, i) => ({ id: String(i), tags: [t], at: day }))
    expect(mixRuns(rows, opts)).toEqual(rows)
    expect(new Set(mixRuns(batch, opts).map((r) => r.id))).toEqual(new Set(batch.map((r) => r.id)))
  })

  it('dated posts keep their relative order and are never pulled forward', () => {
    const rows: Row[] = [
      { id: 'e1', tags: ['Live music'], dated: true, at: day },
      { id: 'e2', tags: ['Live music'], dated: true, at: day },
      { id: 'e3', tags: ['Live music'], dated: true, at: day },
      { id: 'p1', tags: ['Live music'], at: day },
      { id: 'e4', tags: ['Gardening'], dated: true, at: day },
      { id: 'p2', tags: ['Crafts'], at: day },
    ]
    const out = mixRuns(rows, opts).map((r) => r.id)
    expect(out.filter((id) => id.startsWith('e'))).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(out.slice(0, 3)).toEqual(['e1', 'e2', 'p2'])
  })

  it('accepts a run when nothing movable can break it', () => {
    const rows: Row[] = ['1', '2', '3'].map((id) => ({ id, tags: ['Arts & culture'], at: day }))
    expect(mixRuns(rows, opts)).toEqual(rows)
  })

  it('keeps per-visit freshness: different seeds still lead differently after mixing', () => {
    const many: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, tags: [`t${i % 5}`], at: day }))
    const lead = (seed: string) =>
      mixRuns(sessionShuffle(many, seed, { id: (r) => r.id, at: (r) => r.at, now: new Date('2026-10-16T00:00:00Z') }), opts)
        .slice(0, 6)
        .map((r) => r.id)
        .join()
    expect(lead('aaaaaaaaaaaaaaaa')).not.toEqual(lead('bbbbbbbbbbbbbbbb'))
    expect(lead('aaaaaaaaaaaaaaaa')).toEqual(lead('aaaaaaaaaaaaaaaa'))
  })
})

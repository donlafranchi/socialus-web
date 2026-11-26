// D-0282 (the PM, 2026-11-26, "keep it live"): a ruling whose home moved out of socialus-plan keeps its record,
// with its source revised to the new home, so the import stops listing it as gone without replacement.
import { describe, it, expect } from 'vitest'
import { movesToApply, readMoves, MOVES_PATH } from '../scripts/knowledge/moves'

describe('moved sources', () => {
  const moves = [{ id: 'D-0282', source: 'socialus-web:docs/action-layer.md', why: 'Kept live; moved.' }]

  it('revises a record still pointing at its old home, and leaves one already moved', () => {
    expect(movesToApply([{ id: 'D-0282', source: 'accepted-risks/spatial-ref-sys.md', status: 'live' }], moves)).toEqual([
      { id: 'D-0282', changes: { source: 'socialus-web:docs/action-layer.md' }, why: 'Kept live; moved.' },
    ])
    expect(movesToApply([{ id: 'D-0282', source: 'socialus-web:docs/action-layer.md', status: 'live' }], moves)).toEqual([])
  })

  it('skips a record this store lacks, and refuses to revive a retired one', () => {
    expect(movesToApply([], moves)).toEqual([])
    expect(() => movesToApply([{ id: 'D-0282', source: 'x', status: 'retired' }], moves)).toThrow(/retired/)
  })

  it('the moves file holds D-0282, with a why', () => {
    const m = readMoves(MOVES_PATH)
    expect(m.find((x) => x.id === 'D-0282')?.source).toBe('socialus-web:docs/action-layer.md')
    for (const x of m) expect(x.why.trim().length).toBeGreaterThan(0)
  })
})

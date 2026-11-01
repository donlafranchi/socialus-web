// F121 criteria 13–14 — the weekly scoreboard's verdict for each shelf.
import { describe, it, expect } from 'vitest'
import { scoreboard, type ScoreRow } from './verdict'

const W1 = '2026-11-02', W2 = '2026-11-09', W3 = '2026-11-16'
const r = (shelfId: string, weekStart: string, impressions: number, members: number, saves: number, over: Partial<ScoreRow> = {}): ScoreRow => ({
  shelfId,
  name: shelfId,
  seasonal: false,
  weekStart,
  impressions,
  members,
  taps: Math.round(impressions / 10),
  saves,
  ...over,
})

describe('F121 — the shelf scoreboard', () => {
  // [guards F121.14]
  it('too little data under 200 impressions or 10 members in 14 days', () => {
    const board = scoreboard([r('a', W2, 150, 30, 9), r('b', W2, 400, 6, 9)])
    expect(board.find((b) => b.shelfId === 'a')!.verdict).toBe('too little data')
    expect(board.find((b) => b.shelfId === 'b')!.verdict).toBe('too little data')
  })

  // [guards F121.13] [guards F121.14]
  it('two judged weeks in a row at the top save rate: move up; two under half the median: retire; otherwise keep', () => {
    const rows: ScoreRow[] = []
    for (const w of [W2, W3]) {
      rows.push(r('top', w, 300, 20, 30), r('mid', w, 300, 20, 15), r('mid2', w, 300, 20, 14), r('low', w, 300, 20, 2), r('season', w, 300, 20, 1, { seasonal: true }))
    }
    rows.push(r('mid', W1, 300, 20, 60))
    const board = scoreboard(rows)
    const v = Object.fromEntries(board.map((b) => [b.shelfId, b.verdict]))
    expect(v).toEqual({ top: 'move up', mid: 'keep', mid2: 'keep', low: 'retire', season: 'keep' })
    const top = board.find((b) => b.shelfId === 'top')!
    expect(top).toMatchObject({ weekStart: W3, impressions: 300, tapRate: 0.1, saveRate: 0.1 })
  })

  it('no saves anywhere is no top: nothing moves up on a tie at zero', () => {
    const rows = [W2, W3].flatMap((w) => [r('a', w, 300, 20, 0), r('b', w, 300, 20, 0)])
    expect(scoreboard(rows).map((b) => b.verdict)).toEqual(['keep', 'keep'])
  })

  it('one week at the top is not yet two', () => {
    const rows = [r('top', W3, 300, 20, 30), r('other', W3, 300, 20, 10), r('top', W2, 300, 20, 5), r('other', W2, 300, 20, 10)]
    expect(scoreboard(rows).find((b) => b.shelfId === 'top')!.verdict).toBe('keep')
  })
})

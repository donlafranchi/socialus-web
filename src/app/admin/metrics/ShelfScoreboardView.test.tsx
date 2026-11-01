// F121 criterion 13 — the weekly shelf scoreboard: each shelf's impressions, tap rate, save rate and verdict.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { ShelfScoreboardView } from './ShelfScoreboardView'
import type { ScoreLine } from '@/lib/shelves/verdict'

afterEach(cleanup)
const line = (over: Partial<ScoreLine>): ScoreLine => ({
  shelfId: 's', name: 'Lend a hand', seasonal: false, weekStart: '2026-11-09', impressions: 320, members: 25, taps: 32, saves: 8, tapRate: 0.1, saveRate: 0.025, verdict: 'keep', ...over,
})

describe('F121 — the shelf scoreboard', () => {
  // [guards F121.13]
  it('lists each shelf with impressions, tap rate, save rate and the verdict, best save rate first', () => {
    render(<ShelfScoreboardView lines={[line({}), line({ shelfId: 't', name: 'Next 7 days', saveRate: 0.05, verdict: 'move up' })]} />)
    const rows = screen.getAllByTestId('shelf-score')
    expect(rows.map((r) => within(r).getByTestId('shelf-score-name').textContent)).toEqual(['Next 7 days', 'Lend a hand'])
    expect(rows[1]!.textContent).toContain('320')
    expect(rows[1]!.textContent).toContain('10.0%')
    expect(rows[1]!.textContent).toContain('2.5%')
    expect(within(rows[0]!).getByTestId('shelf-score-verdict').textContent).toBe('Move up')
  })

  it('says so when no shelf has been counted yet', () => {
    render(<ShelfScoreboardView lines={[]} />)
    expect(screen.getByTestId('shelf-scoreboard-empty')).toBeTruthy()
  })
})

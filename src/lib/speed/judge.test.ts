import { describe, it, expect } from 'vitest'
import { BUDGETS, judge, slowest } from './judge'

const m = (o: Partial<Parameters<typeof judge>[0]> = {}) =>
  ({ name: 'x', kind: 'consumer' as const, expectsUrl: true, feedbackMs: 40, urlMs: 300, readyMs: 700, ...o })

describe('tap-speed judge', () => {
  it('a fast consumer tap has no flags', () => {
    expect(judge(m())).toEqual([])
  })
  it('flags feedback over 100 ms and content over 1 s for a consumer', () => {
    expect(judge(m({ feedbackMs: 160 }))).toEqual(['slow-feedback'])
    expect(judge(m({ readyMs: 1400 }))).toEqual(['slow-content'])
  })
  it('gives a creator 2.5 s for content', () => {
    expect(judge(m({ kind: 'creator', readyMs: 2400 }))).toEqual([])
    expect(judge(m({ kind: 'creator', readyMs: 2600 }))).toEqual(['slow-content'])
    expect(BUDGETS.creator.readyMs).toBe(2500)
  })
  it('the card moves but navigation stalls: feedback, then no URL change', () => {
    expect(judge(m({ urlMs: null, readyMs: null }))).toContain('stalled')
    expect(judge(m({ urlMs: 4200, readyMs: 4500 }))).toContain('stalled')
  })
  it('a tap that expects no URL change is not stalled', () => {
    expect(judge(m({ expectsUrl: false, urlMs: null }))).toEqual([])
  })
  it('no feedback at all is its own flag', () => {
    expect(judge(m({ feedbackMs: null, urlMs: null, readyMs: null }))).toEqual(['no-feedback', 'never-ready'])
  })
  it('content that never shows is never-ready', () => {
    expect(judge(m({ readyMs: null }))).toEqual(['never-ready'])
  })
  it('ranks the slowest by content time, never-ready first', () => {
    const rows = [m({ name: 'a', readyMs: 500 }), m({ name: 'b', readyMs: null }), m({ name: 'c', readyMs: 2000 })]
    expect(slowest(rows, 2).map((r) => r.name)).toEqual(['b', 'c'])
  })
})

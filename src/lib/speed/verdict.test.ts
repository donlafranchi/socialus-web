import { describe, it, expect } from 'vitest'
import { verdict, regressed, checkpointDue, type Budgets, type Baseline } from './verdict'
import type { TapMeasure } from './judge'

const budgets: Budgets = { 'Open a Page': { kind: 'consumer', feedbackMs: 100, readyMs: 1000 }, 'Edit': { kind: 'creator', feedbackMs: 250, readyMs: 2500 } }
const row = (o: Partial<TapMeasure> = {}): TapMeasure & { mode: string } => ({ name: 'Open a Page', kind: 'consumer', expectsUrl: true, feedbackMs: 60, urlMs: 300, readyMs: 700, mode: 'settled', ...o })

describe('regressed: more than 20% slower than baseline, and by more than 50 ms', () => {
  it('flags a real slowdown', () => expect(regressed(900, 700)).toBe(true))
  it('ignores 20% or less', () => expect(regressed(840, 700)).toBe(false))
  it('ignores noise on tiny numbers', () => expect(regressed(60, 40)).toBe(false))
  it('has nothing to compare without a baseline, or without a reading', () => {
    expect(regressed(900, undefined)).toBe(false)
    expect(regressed(null, 700)).toBe(false)
  })
})

describe('verdict', () => {
  it('green inside budget and baseline', () => {
    const v = verdict(row(), budgets, { 'Open a Page [settled]': { feedbackMs: 60, readyMs: 700 } })
    expect(v.status).toBe('green')
  })
  it('red: a consumer screen over budget with no waiver', () => {
    expect(verdict(row({ readyMs: 1400 }), budgets, {}).status).toBe('red')
  })
  it('amber, not red, when the overrun has an open issue', () => {
    const base: Baseline = { 'Open a Page [settled]': { feedbackMs: 60, readyMs: 1400, issue: 529 } }
    expect(verdict(row({ readyMs: 1400 }), budgets, base).status).toBe('amber')
  })
  it('red: a waived screen that got more than 20% worse', () => {
    const base: Baseline = { 'Open a Page [settled]': { feedbackMs: 60, readyMs: 1400, issue: 529 } }
    expect(verdict(row({ readyMs: 1800 }), budgets, base).status).toBe('red')
  })
  it('red: a stall or a screen that never shows, waiver or not', () => {
    const base: Baseline = { 'Open a Page [settled]': { feedbackMs: 60, readyMs: 700, issue: 1 } }
    expect(verdict(row({ urlMs: null, readyMs: null }), budgets, base).status).toBe('red')
  })
  it('a creator screen over budget is amber, never red on its own', () => {
    expect(verdict(row({ name: 'Edit', kind: 'creator', readyMs: 3000 }), budgets, {}).status).toBe('amber')
  })
  it('red: a creator screen that regressed past baseline by 20%', () => {
    const base: Baseline = { 'Edit [settled]': { feedbackMs: 100, readyMs: 2000 } }
    expect(verdict(row({ name: 'Edit', kind: 'creator', readyMs: 2450 }), budgets, base).status).toBe('red')
  })
  it('a screen without a budget row falls back to the kind default', () => {
    expect(verdict(row({ name: 'New screen', readyMs: 1400 }), budgets, {}).status).toBe('red')
  })
})

describe('checkpointDue', () => {
  it('names the highest checkpoint reached and not yet benchmarked', () => {
    expect(checkpointDue(620, [100])).toBe(500)
    expect(checkpointDue(620, [100, 500])).toBeNull()
    expect(checkpointDue(80, [])).toBeNull()
    expect(checkpointDue(5200, [100, 500, 1000])).toBe(5000)
  })
})

import { medianOf } from './verdict'

describe('medianOf: three readings of one tap', () => {
  it('takes the middle of each number', () => {
    const m = (feedbackMs: number | null, urlMs: number | null, readyMs: number | null) => ({ name: 'x', kind: 'consumer' as const, expectsUrl: true, feedbackMs, urlMs, readyMs })
    expect(medianOf([m(50, 300, 900), m(80, 500, 1500), m(60, 400, 1100)])).toMatchObject({ feedbackMs: 60, urlMs: 400, readyMs: 1100 })
  })
  it('a number missing in most readings stays missing', () => {
    const m = (readyMs: number | null) => ({ name: 'x', kind: 'consumer' as const, expectsUrl: true, feedbackMs: 50, urlMs: 300, readyMs })
    expect(medianOf([m(null), m(null), m(900)]).readyMs).toBeNull()
    expect(medianOf([m(null), m(800), m(900)]).readyMs).toBe(900)
  })
})

describe('a baseline recorded somewhere else only warns', () => {
  it('a regression is amber, not red, until the baseline is from CI', () => {
    const b: Baseline = { 'Open a Page [settled]': { feedbackMs: 60, readyMs: 500 } }
    expect(verdict(row({ readyMs: 700 }), budgets, b, { regressionBinds: false }).status).toBe('amber')
    expect(verdict(row({ readyMs: 700 }), budgets, b).status).toBe('red')
  })
})

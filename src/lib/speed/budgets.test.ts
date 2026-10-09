import { describe, it, expect } from 'vitest'
import budgets from '../../../evals/speed/budgets.json'
import baseline from '../../../evals/speed/baseline.json'
import { STEPS } from '../../../evals/speed/steps'

// #527 — every timed tap has a budget row, and the file holds no row for a tap that is gone.
describe('speed budgets', () => {
  it('has one row per step, and no extras', () => {
    expect(Object.keys(budgets).sort()).toEqual(STEPS.map((s) => s.name).sort())
  })
  it('gives creators a looser budget than consumers, never a tighter one', () => {
    for (const s of STEPS) {
      const b = (budgets as Record<string, { kind: string; readyMs: number }>)[s.name]!
      expect(b.kind).toBe(s.kind)
      expect(b.readyMs).toBe(s.kind === 'consumer' ? 1000 : 2500)
    }
  })
  it('baseline rows name a real tap', () => {
    const names = new Set(STEPS.map((s) => s.name))
    for (const k of Object.keys(baseline)) expect(names.has(k.replace(/ \[(quick|settled)\]$/, '')), k).toBe(true)
  })
})

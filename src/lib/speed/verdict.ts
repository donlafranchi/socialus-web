// #527 — red, amber or green for one timed tap, from its budget and its baseline.
import { BUDGETS, judge, type Flag, type TapKind, type TapMeasure } from './judge'

export type Budgets = Record<string, { kind: TapKind; feedbackMs: number; readyMs: number }>
/** Keyed "<screen> [mode]". `issue` waives an over-budget reading: the overrun is known and filed. */
export type Baseline = Record<string, { feedbackMs: number | null; readyMs: number | null; issue?: number }>

export const REGRESSION = 0.2
/** Below this many ms a change is noise, however large in percent. */
export const NOISE_MS = 50

export const regressed = (now: number | null, base: number | null | undefined): boolean =>
  now !== null && base != null && now > base * (1 + REGRESSION) && now - base > NOISE_MS

export type Status = 'green' | 'amber' | 'red'
export interface Verdict { status: Status; flags: Flag[]; regressed: boolean; over: boolean; waived: boolean }

/** Re-benchmark when membership passes these (Don, 2026-10-08). */
export const CHECKPOINTS = [100, 500, 1000, 5000] as const

/** The highest checkpoint reached that has not been benchmarked yet. */
export function checkpointDue(members: number, done: readonly number[]): number | null {
  const reached = CHECKPOINTS.filter((c) => members >= c && !done.includes(c))
  return reached.length ? reached[reached.length - 1]! : null
}

const middle = (xs: (number | null)[]): number | null => {
  const have = xs.filter((x): x is number => x !== null).sort((a, b) => a - b)
  return have.length * 2 > xs.length ? have[Math.floor((have.length - 1) / 2) + (have.length % 2 === 0 ? 1 : 0)]! : null
}

/** Several readings of one tap, reduced to the middle one of each number. */
export function medianOf(ms: TapMeasure[]): TapMeasure {
  return { ...ms[0]!, feedbackMs: middle(ms.map((m) => m.feedbackMs)), urlMs: middle(ms.map((m) => m.urlMs)), readyMs: middle(ms.map((m) => m.readyMs)) }
}

/** regressionBinds false: the baseline came from another machine, so a slowdown only warns. */
export function verdict(m: TapMeasure & { mode: string }, budgets: Budgets, baseline: Baseline, opts: { regressionBinds?: boolean } = {}): Verdict {
  const own = budgets[m.name]
  const b = own ?? BUDGETS[m.kind]
  const kind = own?.kind ?? m.kind
  const flags = judge(m, b)
  const base = baseline[`${m.name} [${m.mode}]`]
  const hard = flags.some((f) => f === 'stalled' || f === 'never-ready' || f === 'no-feedback')
  const over = flags.some((f) => f === 'slow-content' || f === 'slow-feedback')
  const reg = regressed(m.readyMs, base?.readyMs) || regressed(m.feedbackMs, base?.feedbackMs)
  const regBinds = reg && opts.regressionBinds !== false
  const waived = !!base?.issue
  const status: Status = hard || regBinds || (over && kind === 'consumer' && !waived) ? 'red' : over || reg ? 'amber' : 'green'
  return { status, flags, regressed: reg, over, waived }
}

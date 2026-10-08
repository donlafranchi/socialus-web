// #527 — what counts as too slow, shared by the tap-speed suite and its tests.
export type TapKind = 'consumer' | 'creator'

export interface TapMeasure {
  name: string
  kind: TapKind
  /** The tap is meant to change the URL. */
  expectsUrl: boolean
  feedbackMs: number | null
  urlMs: number | null
  readyMs: number | null
}

/** Consumer: Don's budgets. Creator: patient, so feedback is looser too. */
export const BUDGETS = {
  consumer: { feedbackMs: 100, readyMs: 1000 },
  creator: { feedbackMs: 250, readyMs: 2500 },
} as const

/** Feedback showed, yet the URL took longer than this to change: the card moved and the page did not. */
export const STALL_MS = 2000

export type Flag = 'no-feedback' | 'slow-feedback' | 'stalled' | 'slow-content' | 'never-ready'

export function judge(m: TapMeasure): Flag[] {
  const b = BUDGETS[m.kind]
  const flags: Flag[] = []
  if (m.feedbackMs === null) flags.push('no-feedback')
  else if (m.feedbackMs > b.feedbackMs) flags.push('slow-feedback')
  if (m.feedbackMs !== null && m.expectsUrl && (m.urlMs === null || m.urlMs - m.feedbackMs > STALL_MS)) flags.push('stalled')
  if (m.readyMs === null) flags.push('never-ready')
  else if (m.readyMs > b.readyMs) flags.push('slow-content')
  return flags
}

/** Worst first: a screen that never became usable outranks any slow one. */
export function slowest<T extends TapMeasure>(rows: T[], n: number): T[] {
  const t = (r: T) => (r.readyMs === null ? Infinity : r.readyMs)
  return [...rows].sort((a, b) => t(b) - t(a)).slice(0, n)
}

import { describe, it, expect } from 'vitest'
import { restoreVerdict, isRestoreCandidate, RESTORE_CONFIDENCE, type RestoreFacts } from './restore-gate'
import { HAIKU, SONNET } from './assess'

// F102 criterion 12 (ruled B) — the five conditions, each alone, and the rest.

const read = (model: string, over: Partial<RestoreFacts['haiku'] & object> = {}) => ({
  model,
  severity: 4,
  confidence: 0.97,
  outcome: 'approve' as const,
  ...over,
})

const ok = (over: Partial<RestoreFacts> = {}): RestoreFacts => ({
  aiMode: 'live',
  cleared: true,
  reporterSeverities: [4],
  answered: true,
  coordinated: false,
  haiku: read(HAIKU),
  sonnet: read(SONNET),
  ...over,
})

describe('F102.12 — severity-4 auto-restore gate', () => {
  it('restores when every condition holds', () => {
    expect(restoreVerdict(ok())).toEqual({ act: true, wouldRestore: true, blockedBy: [] })
  })

  it('the bar is 0.95, inclusive', () => {
    expect(RESTORE_CONFIDENCE).toBe(0.95)
    expect(restoreVerdict(ok({ haiku: read(HAIKU, { confidence: 0.95 }), sonnet: read(SONNET, { confidence: 0.95 }) })).act).toBe(true)
  })

  const alone: [string, Partial<RestoreFacts>, string][] = [
    ['the poster has not answered', { answered: false }, 'no_answer'],
    ['Haiku is below 0.95', { haiku: read(HAIKU, { confidence: 0.94 }) }, 'haiku'],
    ['Haiku suggests remove', { haiku: read(HAIKU, { outcome: 'remove' }) }, 'haiku'],
    ['Haiku did not read', { haiku: null }, 'haiku'],
    ['Sonnet is below 0.95', { sonnet: read(SONNET, { confidence: 0.94 }) }, 'sonnet'],
    ['Sonnet suggests remove', { sonnet: read(SONNET, { outcome: 'remove' }) }, 'sonnet'],
    ['Sonnet did not read', { sonnet: null }, 'sonnet'],
    ['reporting looks coordinated', { coordinated: true }, 'coordinated'],
  ]
  it.each(alone)('%s: no restore, still not a would-restore', (_n, over, gate) => {
    const v = restoreVerdict(ok(over))
    expect(v.act).toBe(false)
    expect(v.wouldRestore).toBe(false)
    expect(v.blockedBy).toEqual([gate])
  })

  it('the harness not having cleared the slice blocks the act but still records a would-restore', () => {
    expect(restoreVerdict(ok({ cleared: false }))).toEqual({ act: false, wouldRestore: true, blockedBy: ['not_cleared'] })
  })

  it('shadow never acts, and records what it would have done', () => {
    expect(restoreVerdict(ok({ aiMode: 'shadow' }))).toEqual({ act: false, wouldRestore: true, blockedBy: ['shadow'] })
    expect(restoreVerdict(ok({ aiMode: 'shadow', cleared: false })).act).toBe(false)
  })

  it.each([1, 2, 3] as const)('a severity-%s reason never restores', (n) => {
    const v = restoreVerdict(ok({ reporterSeverities: [n] }))
    expect(v.act).toBe(false)
    expect(v.wouldRestore).toBe(false)
    expect(v.blockedBy).toContain('not_severity_4')
  })

  it.each([1, 2, 3] as const)('an AI read of severity %s never restores', (n) => {
    expect(restoreVerdict(ok({ sonnet: read(SONNET, { severity: n }) })).blockedBy).toContain('not_severity_4')
    expect(restoreVerdict(ok({ haiku: read(HAIKU, { severity: n }) })).act).toBe(false)
  })

  it('one more serious reason among several blocks, and so does a report with no reason', () => {
    expect(restoreVerdict(ok({ reporterSeverities: [4, 2] })).act).toBe(false)
    expect(restoreVerdict(ok({ reporterSeverities: [4, null] })).act).toBe(false)
    expect(restoreVerdict(ok({ reporterSeverities: [] })).act).toBe(false)
  })

  it('a candidate needs a reply, a severity-4 reason and a confident approving first read', () => {
    const first = read(HAIKU)
    expect(isRestoreCandidate(first, { rebuttal: 'It is my shop.', reporterSeverity: 4 })).toBe(true)
    expect(isRestoreCandidate(first, { rebuttal: null, reporterSeverity: 4 })).toBe(false)
    expect(isRestoreCandidate(first, { rebuttal: 'x', reporterSeverity: 2 })).toBe(false)
    expect(isRestoreCandidate(read(HAIKU, { confidence: 0.9 }), { rebuttal: 'x', reporterSeverity: 4 })).toBe(false)
    expect(isRestoreCandidate(read(HAIKU, { outcome: 'remove' }), { rebuttal: 'x', reporterSeverity: 4 })).toBe(false)
  })
})

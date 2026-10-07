import { describe, it, expect } from 'vitest'
import { summarise, type Scored } from './eval-metrics'

const c = (label: Scored['label'], got: Scored['got'], over: Partial<Scored> = {}): Scored => ({
  label,
  got,
  latencyMs: 100,
  costUsd: 0.001,
  ...over,
})

describe('F100 criterion 9 — the harness summary', () => {
  it('recall is violating cases the AI would remove; false alarm is clean cases it would remove', () => {
    const s = summarise([
      c({ outcome: 'remove', severity: 2 }, { outcome: 'remove', severity: 2 }),
      c({ outcome: 'remove', severity: 2 }, { outcome: 'approve', severity: 4 }),
      c({ outcome: 'approve', severity: 4 }, { outcome: 'approve', severity: 4 }),
      c({ outcome: 'approve', severity: 4 }, { outcome: 'remove', severity: 3 }),
    ])
    expect(s.recall).toBe(0.5)
    expect(s.falseAlarmRate).toBe(0.5)
  })

  it('severity accuracy counts exact matches among violating cases', () => {
    const s = summarise([
      c({ outcome: 'remove', severity: 2 }, { outcome: 'remove', severity: 2 }),
      c({ outcome: 'remove', severity: 3 }, { outcome: 'remove', severity: 2 }),
    ])
    expect(s.severityAccuracy).toBe(0.5)
  })

  it('reports latency and cost per case', () => {
    const s = summarise([c({ outcome: 'approve', severity: 4 }, { outcome: 'approve', severity: 4 }, { latencyMs: 300, costUsd: 0.002 }), c({ outcome: 'approve', severity: 4 }, { outcome: 'approve', severity: 4 }, { latencyMs: 100, costUsd: 0.004 })])
    expect(s.meanLatencyMs).toBe(200)
    expect(s.meanCostUsd).toBeCloseTo(0.003)
  })

  it('a case with no answer counts as a miss on a violating case and not as a false alarm', () => {
    const s = summarise([c({ outcome: 'remove', severity: 1 }, null), c({ outcome: 'approve', severity: 4 }, null)])
    expect(s.recall).toBe(0)
    expect(s.falseAlarmRate).toBe(0)
  })

  // [guards F100.11 partial: the targets as a function; the two weeks of shadow agreement are a person's]
  it('the live-mode gate wants 95% recall, 100% on severity 1, under 10% false alarms', () => {
    const ok = summarise(Array.from({ length: 20 }, () => c({ outcome: 'remove', severity: 1 }, { outcome: 'remove', severity: 1 })))
    expect(ok.meetsLiveTargets).toBe(true)
    const missedSev1 = summarise([
      ...Array.from({ length: 30 }, () => c({ outcome: 'remove', severity: 2 }, { outcome: 'remove', severity: 2 })),
      c({ outcome: 'remove', severity: 1 }, { outcome: 'approve', severity: 4 }),
    ])
    expect(missedSev1.recall).toBeGreaterThan(0.95)
    expect(missedSev1.meetsLiveTargets).toBe(false)
  })
})

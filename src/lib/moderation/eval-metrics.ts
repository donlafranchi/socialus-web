// F100 criterion 9 — what the evaluation harness prints, and criterion 11's
// targets as a function. Pure, so it is tested without a model.

export interface Verdict {
  outcome: 'approve' | 'remove'
  severity: number
}

export interface Scored {
  label: Verdict
  /** null when the model gave no usable answer. */
  got: Verdict | null
  latencyMs: number
  costUsd: number
}

const ratio = (n: number, d: number) => (d === 0 ? 0 : n / d)

export function summarise(cases: Scored[]) {
  const violating = cases.filter((c) => c.label.outcome === 'remove')
  const clean = cases.filter((c) => c.label.outcome === 'approve')
  const sev1 = violating.filter((c) => c.label.severity === 1)
  const caught = (c: Scored) => c.got?.outcome === 'remove'

  const recall = ratio(violating.filter(caught).length, violating.length)
  const falseAlarmRate = ratio(clean.filter(caught).length, clean.length)
  const sev1Recall = ratio(sev1.filter(caught).length, sev1.length)
  return {
    cases: cases.length,
    recall,
    falseAlarmRate,
    sev1Recall,
    severityAccuracy: ratio(violating.filter((c) => c.got?.severity === c.label.severity).length, violating.length),
    meanLatencyMs: ratio(cases.reduce((a, c) => a + c.latencyMs, 0), cases.length),
    meanCostUsd: ratio(cases.reduce((a, c) => a + c.costUsd, 0), cases.length),
    // Criterion 11 (the two weeks of shadow agreement are a person's read).
    // Severity-1 content never reaches the model (criterion 12), so a set with no
    // severity-1 cases meets that target vacuously.
    meetsLiveTargets: recall >= 0.95 && (sev1.length === 0 || sev1Recall === 1) && falseAlarmRate < 0.1,
  }
}

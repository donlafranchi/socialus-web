// #640 (F100.11, the PM's call C, 2026-10-11) — "AI readiness": the harness numbers against the ruled targets
// and the days of shadow reads, each green / amber / red, plus one "ready to go live" light. Pure; the data
// comes from the last recorded harness run and the shadow reads. This shows Don the numbers for his own
// checklist; software refusing the flip is the production step.

export const RECALL_TARGET = 0.95
export const SEV1_TARGET = 1
export const FALSE_ALARM_TARGET = 0.1
export const SHADOW_DAYS_TARGET = 14

export type Status = 'green' | 'amber' | 'red'

export interface EvalRun {
  runAt: Date
  cases: number
  recall: number
  sev1Cases: number
  sev1Recall: number
  falseAlarmRate: number
}

export interface Reading {
  value: number | null
  target: number
  status: Status
  runAt: Date | null
  daysAgo: number | null
  note?: string
}

export interface Readiness {
  recall: Reading
  sev1Recall: Reading
  falseAlarms: Reading
  shadow: { days: number; of: number; status: Status }
  ready: boolean
}

const DAY = 86_400_000

export function readiness({ run, shadowDays, now }: { run: EvalRun | null; shadowDays: number; now: Date }): Readiness {
  const when = run ? { runAt: run.runAt, daysAgo: Math.floor((now.getTime() - run.runAt.getTime()) / DAY) } : { runAt: null, daysAgo: null }
  const reading = (value: number | null, target: number, status: Status, note?: string): Reading => ({ value, target, status, ...when, ...(note ? { note } : {}) })

  // Higher is better: green at the target, amber within the band below it, red under that.
  const higher = (v: number | null, target: number, band = 0.05): Status => (v === null ? 'red' : v >= target ? 'green' : v >= target - band ? 'amber' : 'red')

  const recall = reading(run?.recall ?? null, RECALL_TARGET, higher(run?.recall ?? null, RECALL_TARGET))
  const sev1Recall =
    run && run.sev1Cases === 0
      ? // Severity-1 content never reaches the model, so a set with none meets the target vacuously: not a pass.
        reading(run.sev1Recall, SEV1_TARGET, 'amber', 'No severity-1 cases in the set yet, so this proves nothing.')
      : reading(run?.sev1Recall ?? null, SEV1_TARGET, higher(run?.sev1Recall ?? null, SEV1_TARGET, 0.1))
  // Lower is better: green under the target, amber under half as much again, red above.
  const fa = run?.falseAlarmRate ?? null
  const falseAlarms = reading(fa, FALSE_ALARM_TARGET, fa === null ? 'red' : fa < FALSE_ALARM_TARGET ? 'green' : fa < FALSE_ALARM_TARGET * 1.5 ? 'amber' : 'red')

  const days = Math.max(0, Math.min(shadowDays, SHADOW_DAYS_TARGET))
  const shadow = { days, of: SHADOW_DAYS_TARGET, status: (days >= SHADOW_DAYS_TARGET ? 'green' : days >= SHADOW_DAYS_TARGET / 2 ? 'amber' : 'red') as Status }

  return { recall, sev1Recall, falseAlarms, shadow, ready: [recall, sev1Recall, falseAlarms].every((r) => r.status === 'green') && shadow.status === 'green' }
}

// #640 (F100.11) — a harness run is recorded, and the last one read back for the AI readiness panel.

import type { EvalRun } from './readiness'
import type { summarise } from './eval-metrics'

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

type Summary = Pick<ReturnType<typeof summarise>, 'cases' | 'sev1Cases' | 'recall' | 'sev1Recall' | 'falseAlarmRate' | 'meetsLiveTargets'>

export async function recordEvalRun(db: Queryable, s: Summary): Promise<void> {
  await db.query(
    `insert into public.moderation_eval_runs (cases, recall, sev1_cases, sev1_recall, false_alarm_rate, meets_targets)
     values ($1, $2, $3, $4, $5, $6)`,
    [s.cases, s.recall, s.sev1Cases, s.sev1Recall, s.falseAlarmRate, s.meetsLiveTargets],
  )
}

export async function lastEvalRun(db: Queryable): Promise<EvalRun | null> {
  const { rows } = await db.query(
    `select run_at, cases, recall, sev1_cases, sev1_recall, false_alarm_rate
       from public.moderation_eval_runs order by run_at desc limit 1`,
  )
  const r = rows[0]
  if (!r) return null
  return {
    runAt: new Date(r.run_at as string | Date),
    cases: Number(r.cases),
    recall: Number(r.recall),
    sev1Cases: Number(r.sev1_cases),
    sev1Recall: Number(r.sev1_recall),
    falseAlarmRate: Number(r.false_alarm_rate),
  }
}

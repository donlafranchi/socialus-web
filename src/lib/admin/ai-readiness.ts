// #640 (F100.11) — the AI readiness panel's data, read server-side (the tables have no client policy).

import { getPool } from '@/actions/_lib/db'
import { lastEvalRun } from '@/lib/moderation/eval-record'
import { readiness, type Readiness } from '@/lib/moderation/readiness'

export async function fetchAiReadiness(now = new Date()): Promise<Readiness> {
  const pool = getPool()
  const [run, shadow] = await Promise.all([
    lastEvalRun(pool),
    // Days since the AI first read a report in shadow: the two weeks the PM reads (criterion 11).
    pool.query(`select floor(extract(epoch from (now() - min(created_at))) / 86400)::int as days from public.report_assessments where outcome is not null`),
  ])
  return readiness({ run, shadowDays: Number(shadow.rows[0]?.days ?? 0), now })
}

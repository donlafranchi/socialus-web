// #640 (F100.11) — the AI readiness panel's data, read server-side (the tables have no client policy).

import { getPool } from '@/actions/_lib/db'
import { lastEvalRun } from '@/lib/moderation/eval-record'
import { readiness, type Readiness } from '@/lib/moderation/readiness'

export async function fetchAiReadiness(now = new Date()): Promise<Readiness> {
  const pool = getPool()
  const [run, shadow] = await Promise.all([
    lastEvalRun(pool),
    // Shadow-agreement days (criterion 11, ruled 2026-10-11 on #640): since a person first decided a report the AI had read.
    pool.query(
      `select floor(extract(epoch from (now() - min(d.decided_at))) / 86400)::int as days
         from public.report_ai_agreement g
         join public.report_decisions d on d.report_id = g.report_id and not d.decided_by_ai`,
    ),
  ])
  return readiness({ run, shadowDays: Number(shadow.rows[0]?.days ?? 0), now })
}

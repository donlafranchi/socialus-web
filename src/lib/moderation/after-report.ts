// F100 criterion 1 — the AI read happens after the response, so a report never
// waits on it, and a failure here leaves the report as F078 handles it.

import { after } from 'next/server'
import { getPool } from '@/actions/_lib/db'
import { runAssessment } from './run-assessment'

export function assessAfterReport(reportId: string, { rebuttal = null }: { rebuttal?: string | null } = {}): void {
  if (!process.env.ANTHROPIC_API_KEY) return
  const job = () =>
    runAssessment(reportId, getPool(), { rebuttal }).catch((err) =>
      console.error('[moderation] assessment failed:', err instanceof Error ? err.message : err),
    )
  try {
    after(job)
  } catch {
    // Outside a request (a script, a test): run it and carry on.
    void job()
  }
}

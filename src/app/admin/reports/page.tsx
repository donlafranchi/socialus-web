// T122 (#12) — the operator's review queue. The launch blocker.
//
// [member-content-takedown] is why this exists: nothing a member contributes
// goes live in production until there is a report-and-takedown path for it.
// Reporting shipped; this is the takedown half.
//
// A NON-OPERATOR GETS 404, NOT 403. The surface does not announce itself —
// a 403 tells a stranger there is something here worth finding.
//
// Reads go server-side over DATABASE_URL. `reports` has no client SELECT policy
// and must not gain one.

import Link from 'next/link'
import { requirePagePermission } from '@/lib/staff/page-guard'
import { isBuilderOperator } from '@/actions/_lib/operator'
import { fetchAiMode, fetchReviewQueue, fetchWeekSummary } from '@/lib/admin/reports-queue'
import { fetchAiReadiness } from '@/lib/admin/ai-readiness'
import { groupBySubject } from '@/lib/admin/review-subjects'
import { ReviewQueue } from './ReviewQueue'
import { AiReadiness } from './AiReadiness'
import { decideReportAction, reverseDecisionAction } from './actions'

// The queue is a live fact about withheld content. Never prerendered, never
// cached — a stale queue means reviewing something already decided.
export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  const viewer = await requirePagePermission('reports.review')

  const [queue, summary, mode, readiness] = await Promise.all([
    fetchReviewQueue(200, { includeBuilders: isBuilderOperator(viewer) }),
    fetchWeekSummary(),
    fetchAiMode(),
    // #640 — the numbers for Don's own go-live checklist; a failed read must not hide the queue.
    fetchAiReadiness().catch(() => null),
  ])

  return (
    // F101 / #304 — phone-first (#12): one column, full-bleed at 375, capped at
    // the read width on a laptop.
    <main className="mx-auto w-full max-w-read gutter py-6 pb-nav" data-testid="admin-reports">
      <p className="mb-3 flex flex-wrap gap-x-4 text-body-sm">
        <Link href="/admin/reports/purge" className="inline-flex min-h-11 items-center underline" data-testid="purge-link">
          Removed photos
        </Link>
        <a
          href="https://github.com/donlafranchi/socialus-ops/blob/main/runbooks/staff-safety.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center underline"
          data-testid="safety-runbook-link"
        >
          Safety runbook
        </a>
      </p>
      {readiness && <AiReadiness readiness={readiness} />}
      <ReviewQueue subjects={groupBySubject(queue, { live: mode === 'live' })} summary={summary} onDecide={decideReportAction} onReverse={reverseDecisionAction} />
    </main>
  )
}

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

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { isBuilderOperator, isOperator } from '@/actions/_lib/operator'
import { fetchReviewQueue } from '@/lib/admin/reports-queue'
import { groupBySubject } from '@/lib/admin/review-subjects'
import { ReviewQueue } from './ReviewQueue'
import { decideReportAction, reverseDecisionAction } from './actions'

// The queue is a live fact about withheld content. Never prerendered, never
// cached — a stale queue means reviewing something already decided.
export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const viewer = data.user?.id ?? null
  if (!isOperator(viewer)) notFound()

  const queue = await fetchReviewQueue(200, { includeBuilders: isBuilderOperator(viewer) })

  return (
    // F101 / #304 — phone-first (#12): one column, full-bleed at 375, capped at
    // the read width on a laptop.
    <main className="mx-auto w-full max-w-read gutter py-6 pb-nav" data-testid="admin-reports">
      <ReviewQueue subjects={groupBySubject(queue)} onDecide={decideReportAction} onReverse={reverseDecisionAction} />
    </main>
  )
}

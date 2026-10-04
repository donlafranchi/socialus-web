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
import { fetchReviewQueue, hiddenFor } from '@/lib/admin/reports-queue'
import { ReportEntry } from './ReportEntry'
import { decideReportAction, reverseDecisionAction } from './actions'

// The queue is a live fact about withheld content. Never prerendered, never
// cached — a stale queue means reviewing something already decided.
export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const viewer = data.user?.id ?? null
  if (!isOperator(viewer)) notFound()

  const queue = await fetchReviewQueue(50, { includeBuilders: isBuilderOperator(viewer) })
  const now = new Date()

  return (
    // Phone-first is the requirement, not a nice-to-have (#12). One column,
    // full-bleed at 375, capped so it stays readable on a laptop.
    <main className="mx-auto w-full max-w-xl px-3 py-4" data-testid="admin-reports">
      <h1 className="text-lg font-semibold text-[var(--color-fg)]">Reports</h1>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        {queue.length === 0
          ? 'Nothing here.'
          : `${queue.filter((r) => r.history.length === 0).length} waiting · decided ones stay below, and any decision can be undone`}
      </p>

      {queue.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-4 list-none p-0">
          {queue.map((r) => (
            <ReportEntry
              key={r.reportId}
              report={r}
              hiddenFor={hiddenFor(r.hiddenAt, now)}
              onDecide={decideReportAction}
              onReverse={reverseDecisionAction}
            />
          ))}
        </ul>
      ) : null}
    </main>
  )
}

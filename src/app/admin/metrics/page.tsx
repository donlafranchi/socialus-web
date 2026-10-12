// #544 — the weekly numbers, for staff with metrics.view. Anyone else gets 404.
// Read through the member's own session: the database function checks the role
// again and returns nothing without it.

import { requirePagePermission } from '@/lib/staff/page-guard'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { fetchAiReadiness } from '@/lib/admin/ai-readiness'
import { MetricsView, type WeekRow } from './MetricsView'

export const dynamic = 'force-dynamic'

export default async function AdminMetricsPage() {
  await requirePagePermission('metrics.view')
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_metrics_weekly', { p_weeks: 2 })
  // #640 — the same light as /admin/reports; a failed read leaves it out, never the metrics.
  const readiness = await fetchAiReadiness().catch(() => null)
  return (
    <main className="mx-auto w-full max-w-xl px-3 py-4" data-testid="admin-metrics">
      <h1 className="mb-3 text-lg font-semibold text-[var(--color-fg)]">Metrics</h1>
      {readiness && (
        <p data-testid="ai-readiness-light" className="mb-3 flex items-center gap-2 text-body-sm text-[var(--color-fg)]">
          <span aria-hidden="true" className={`inline-block h-3 w-3 rounded-full ${readiness.ready ? 'bg-green-600' : 'bg-red-600'}`} />
          AI readiness: {readiness.ready ? 'Ready to go live' : 'Not ready to go live yet'}{' '}
          <Link href="/admin/reports" className="underline">
            Numbers
          </Link>
        </p>
      )}
      <MetricsView rows={(data ?? []) as WeekRow[]} />
    </main>
  )
}

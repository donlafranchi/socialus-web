// #544 — the weekly numbers, for staff with metrics.view. Anyone else gets 404.
// Read through the member's own session: the database function checks the role
// again and returns nothing without it.

import { requirePagePermission } from '@/lib/staff/page-guard'
import { createClient } from '@/lib/supabase-server'
import { MetricsView, type WeekRow } from './MetricsView'

export const dynamic = 'force-dynamic'

export default async function AdminMetricsPage() {
  await requirePagePermission('metrics.view')
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_metrics_weekly', { p_weeks: 2 })
  return (
    <main className="mx-auto w-full max-w-xl px-3 py-4" data-testid="admin-metrics">
      <h1 className="mb-3 text-lg font-semibold text-[var(--color-fg)]">Metrics</h1>
      <MetricsView rows={(data ?? []) as WeekRow[]} />
    </main>
  )
}

// #544 — the weekly numbers, for staff with metrics.view. Anyone else gets 404.
// Read through the member's own session: the database function checks the role
// again and returns nothing without it.

import { requirePagePermission } from '@/lib/staff/page-guard'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { fetchAiReadiness } from '@/lib/admin/ai-readiness'
import { MetricsView, type WeekRow } from './MetricsView'
import { SearchDemandView, type DemandRow } from './SearchDemandView'
import { ShelfScoreboardView } from './ShelfScoreboardView'
import { MapTapsView, type MapTapRow } from './MapTapsView'
import { scoreboard } from '@/lib/shelves/verdict'

export const dynamic = 'force-dynamic'

type ShelfWeekRow = { shelf_id: string; name: string; season_end: string | null; week_start: string; impressions: number; members: number; taps: number; saves: number }
const toScoreRow = (r: ShelfWeekRow) => ({
  shelfId: r.shelf_id,
  name: r.name,
  seasonal: r.season_end !== null,
  weekStart: r.week_start,
  impressions: r.impressions,
  members: r.members,
  taps: r.taps,
  saves: r.saves,
})

export default async function AdminMetricsPage() {
  await requirePagePermission('metrics.view')
  const supabase = await createClient()
  const [{ data }, demand, shelves, mapTaps] = await Promise.all([
    supabase.rpc('admin_metrics_weekly', { p_weeks: 2 }),
    // #909 — what locals searched; a failed read shows the empty state, never takes the page down.
    supabase.rpc('admin_search_demand', { p_weeks: 4, p_limit: 10 }),
    // F121 — the shelf scoreboard; weeks back so a verdict can see two judged weeks.
    supabase.rpc('admin_shelf_scoreboard', { p_weeks: 8 }),
    // plan #258 — map taps per day, for the 2026-11-15 map review.
    supabase.rpc('admin_map_taps', { p_days: 14 }),
  ])
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
      <div className="mt-3">
        <SearchDemandView rows={(demand?.data ?? []) as DemandRow[]} />
      </div>
      <div className="mt-3">
        <ShelfScoreboardView lines={scoreboard(((shelves?.data ?? []) as ShelfWeekRow[]).map(toScoreRow))} />
      </div>
      <div className="mt-3">
        <MapTapsView rows={(mapTaps?.data ?? []) as MapTapRow[]} />
      </div>
    </main>
  )
}

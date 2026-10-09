// #544 — the four starter numbers for the Sacramento metro, this week beside
// last week. Plain numbers (Don, 2026-10-09): real counts, no suppression, and
// nothing about any one member. Connection here is follow or join, a proxy.

export interface WeekRow {
  week_start: string
  gatherings: number
  venues: number
  new_members: number
  new_members_connected: number
  members_total: number
  members_unconnected: number
}

function Metric({ id, title, hint, now, before }: { id: string; title: string; hint: string; now: string; before: string }) {
  return (
    <section data-testid={`metric-${id}`} className="card p-4">
      <h2 className="text-sm font-semibold text-[var(--color-fg)]">{title}</h2>
      <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">{hint}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-[var(--color-fg-muted)]">This week</dt>
          <dd data-testid="this-week" className="text-2xl font-semibold tabular-nums text-[var(--color-fg)]">{now}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-fg-muted)]">Last week</dt>
          <dd data-testid="last-week" className="text-2xl tabular-nums text-[var(--color-fg-muted)]">{before}</dd>
        </div>
      </dl>
    </section>
  )
}

const of = (n: number, total: number) => `${n} of ${total}`

export function MetricsView({ rows }: { rows: WeekRow[] }) {
  const [now, before] = rows
  if (!now || !before) {
    return (
      <p data-testid="metrics-empty" className="card p-4 text-sm text-[var(--color-fg-muted)]">
        No numbers to show. Your account needs a role with metrics access in the database.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--color-fg-muted)]">
        Sacramento metro. Weeks start Monday (Pacific). This week began {now.week_start}.
      </p>
      <Metric id="gatherings" title="Dated gatherings" hint="Posts with a start time that start in the week." now={String(now.gatherings)} before={String(before.gatherings)} />
      <Metric id="venues" title="Venues hosting" hint="Distinct places with a dated gathering in the 30 days to the end of the week." now={String(now.venues)} before={String(before.venues)} />
      <Metric id="newcomers" title="New members who connected" hint="Of members who joined in the week, those who followed or joined something within 14 days. This week's window is still open." now={of(now.new_members_connected, now.new_members)} before={of(before.new_members_connected, before.new_members)} />
      <Metric id="unconnected" title="Members with zero connections" hint="Of members 14 or more days old, those following nothing and in no Page." now={of(now.members_unconnected, now.members_total)} before={of(before.members_unconnected, before.members_total)} />
      <p data-testid="metrics-note" className="text-xs text-[var(--color-fg-muted)]">
        Connection means follow or join, not meeting: beta records no attendance. Counts only; no member is shown.
      </p>
    </div>
  )
}

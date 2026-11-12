// F133 — the three answers: who comes back, what they use, where they drop off. Counts only; no member is stored
// with a count, and a member who turned sharing off on You or a builder is in none of them. Words are drafts for Don.

export interface UsageWeekRow {
  week: string
  join_week: string
  active: number
}
export interface UsageDayRow {
  day: string
  part: string
  members: number
}
export interface FunnelRow {
  week: string
  step: string
  reached: number
}

export const PARTS: { key: string; label: string }[] = [
  { key: 'posts', label: 'Posts' },
  { key: 'explore', label: 'Explore' },
  { key: 'pages', label: 'Pages' },
  { key: 'groups', label: 'Groups' },
  { key: 'map', label: 'Map' },
  { key: 'search', label: 'Search' },
  { key: 'ask', label: 'Ask' },
]
export const STEPS: { key: string; label: string }[] = [
  { key: 'signed_in', label: 'Signed in' },
  { key: 'profile', label: 'Profile' },
  { key: 'welcomed', label: 'Welcomed' },
  { key: 'first_follow', label: 'First follow' },
  { key: 'first_post', label: 'First post' },
]
const COHORT_WEEKS = 12

const short = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const weekday = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const weeksBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / (7 * 86_400_000))

const cell = 'px-1.5 py-0.5 text-right tabular-nums'
const head = 'px-1.5 py-0.5 text-right font-normal text-[var(--color-fg-muted)]'

function Card({ id, title, note, empty, children }: { id: string; title: string; note: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section data-testid={id} className="card p-4">
      <h2 className="text-sm font-semibold text-[var(--color-fg)]">{title}</h2>
      <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">{note}</p>
      {empty ? (
        <p data-testid={`${id}-empty`} className="mt-3 text-sm text-[var(--color-fg-muted)]">
          Nothing counted yet.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">{children}</div>
      )}
    </section>
  )
}

/** F133.1 — one row per join week, newest first; each column is how many of them were active that many weeks later. */
export function ComingBackView({ rows }: { rows: UsageWeekRow[] }) {
  const cohorts = [...new Set(rows.map((r) => r.join_week))].sort((a, b) => b.localeCompare(a)).slice(0, COHORT_WEEKS)
  const at = new Map(rows.map((r) => [`${r.join_week}|${weeksBetween(r.join_week, r.week)}`, r.active]))
  const span = Math.min(COHORT_WEEKS, Math.max(1, ...rows.map((r) => weeksBetween(r.join_week, r.week) + 1)))
  return (
    <Card id="usage-coming-back" title="Coming back" note="Members active each week, by the week they joined. Week 0 is the week they joined." empty={cohorts.length === 0}>
      <table className="w-full text-xs text-[var(--color-fg)]">
        <thead>
          <tr>
            <th className="px-1.5 py-0.5 text-left font-normal text-[var(--color-fg-muted)]">Joined</th>
            {Array.from({ length: span }, (_, i) => (
              <th key={i} className={head}>
                {i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c} data-testid="usage-cohort">
              <td className="px-1.5 py-0.5 text-left">{short(c)}</td>
              {Array.from({ length: span }, (_, i) => (
                <td key={i} className={cell}>
                  {at.get(`${c}|${i}`) ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

/** F133.2 — one row per day, newest first; how many members used each part. */
export function WhatTheyUseView({ rows }: { rows: UsageDayRow[] }) {
  const days = [...new Set(rows.map((r) => r.day))].sort((a, b) => b.localeCompare(a))
  const at = new Map(rows.map((r) => [`${r.day}|${r.part}`, r.members]))
  return (
    <Card id="usage-parts" title="What they use" note="Members who used each part of the app, per day, the last two weeks." empty={days.length === 0}>
      <table className="w-full text-xs text-[var(--color-fg)]">
        <thead>
          <tr>
            <th className="px-1.5 py-0.5 text-left font-normal text-[var(--color-fg-muted)]">Day</th>
            {PARTS.map((p) => (
              <th key={p.key} className={head}>
                {p.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d} data-testid="usage-day">
              <td className="px-1.5 py-0.5 text-left">{weekday(d)}</td>
              {PARTS.map((p) => (
                <td key={p.key} className={cell}>
                  {at.get(`${d}|${p.key}`) ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

/** F133.3 — one row per week, newest first; how many members reached each step. */
export function DropOffView({ rows }: { rows: FunnelRow[] }) {
  const weeks = [...new Set(rows.map((r) => r.week))].sort((a, b) => b.localeCompare(a))
  const at = new Map(rows.map((r) => [`${r.week}|${r.step}`, r.reached]))
  return (
    <Card id="usage-funnel" title="Where they drop off" note="Members who reached each step of sign-up, a first follow and a first post, per week." empty={weeks.length === 0}>
      <table className="w-full text-xs text-[var(--color-fg)]">
        <thead>
          <tr>
            <th className="px-1.5 py-0.5 text-left font-normal text-[var(--color-fg-muted)]">Week of</th>
            {STEPS.map((s) => (
              <th key={s.key} className={head}>
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w} data-testid="usage-week">
              <td className="px-1.5 py-0.5 text-left">{short(w)}</td>
              {STEPS.map((s) => (
                <td key={s.key} className={cell}>
                  {at.get(`${w}|${s.key}`) ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

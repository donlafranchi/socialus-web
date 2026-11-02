// plan #258 — does anyone use the map? "Show on map" and Directions taps per day, beside the map mix for the
// 2026-11-15 review. Counts only; no member is stored with a count.

export interface MapTapRow {
  day: string
  show_on_map: number
  directions: number
}

const label = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export function MapTapsView({ rows }: { rows: MapTapRow[] }) {
  const sorted = [...rows].sort((a, b) => b.day.localeCompare(a.day))
  return (
    <section data-testid="map-taps" className="card p-4">
      <h2 className="text-sm font-semibold text-[var(--color-fg)]">Map taps</h2>
      <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">Show on map and Directions, per day, the last two weeks.</p>
      {sorted.length === 0 ? (
        <p data-testid="map-taps-empty" className="mt-3 text-sm text-[var(--color-fg-muted)]">
          No map tap counted yet.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-1">
          {sorted.map((r) => (
            <li key={r.day} data-testid="map-taps-day" className="flex items-baseline justify-between gap-3 text-sm text-[var(--color-fg)]">
              <span data-testid="map-taps-date">{label(r.day)}</span>
              <span className="tabular-nums text-xs text-[var(--color-fg-muted)]">
                {r.show_on_map} Show on map · {r.directions} Directions
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

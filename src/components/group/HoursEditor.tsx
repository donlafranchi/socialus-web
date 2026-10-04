'use client'

// #293 — a Page's weekly hours: each day open or closed, with one opening and
// closing time. Times are the metro's wall clock.

import { DAYS, DAY_LABEL, type Day, type OpeningHours } from '@/lib/groups/opening-hours'

const DEFAULT = { open: '09:00', close: '17:00' }

export function HoursEditor({
  value,
  onChange,
}: {
  value: OpeningHours | null
  onChange: (next: OpeningHours | null) => void
}) {
  const week = value ?? {}
  const emit = (next: OpeningHours) => onChange(Object.keys(next).length > 0 ? next : null)
  const setDay = (day: Day, ranges: { open: string; close: string }[] | null) => {
    const next = { ...week }
    if (ranges) next[day] = ranges
    else delete next[day]
    emit(next)
  }

  return (
    <fieldset data-testid="hours-editor" className="space-y-1">
      <legend className="text-sm font-medium text-[var(--color-fg)]">Opening hours</legend>
      {DAYS.map((day) => {
        const range = week[day]?.[0]
        return (
          <div key={day} className="flex min-h-11 flex-wrap items-center gap-2 text-sm">
            <label className="flex w-32 items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(range)}
                onChange={(e) => setDay(day, e.target.checked ? [DEFAULT] : null)}
                className="h-4 w-4"
              />
              {DAY_LABEL[day]}
            </label>
            {range ? (
              <>
                <input
                  type="time"
                  aria-label={`${DAY_LABEL[day]} opens`}
                  value={range.open}
                  onChange={(e) => setDay(day, [{ ...range, open: e.target.value }])}
                  className="input"
                />
                <span aria-hidden="true">–</span>
                <input
                  type="time"
                  aria-label={`${DAY_LABEL[day]} closes`}
                  value={range.close}
                  onChange={(e) => setDay(day, [{ ...range, close: e.target.value }])}
                  className="input"
                />
              </>
            ) : (
              <span className="text-[var(--color-fg-muted)]">Closed</span>
            )}
          </div>
        )
      })}
    </fieldset>
  )
}

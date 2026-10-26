// #592 (F074.1) — the shape of a weekly series: one or more chosen weekdays, an optional start date and an
// optional end date. The creator never enters individual dates, and no other pattern exists (F074 § Not this).
// Dates are wall dates (`yyyy-mm-dd`) in the metro; times and daylight saving are the expansion's job (F074.5).

import { z } from 'zod'

export const SERIES_WEEKDAYS = [
  { n: 1, short: 'Mon', long: 'Monday' },
  { n: 2, short: 'Tue', long: 'Tuesday' },
  { n: 3, short: 'Wed', long: 'Wednesday' },
  { n: 4, short: 'Thu', long: 'Thursday' },
  { n: 5, short: 'Fri', long: 'Friday' },
  { n: 6, short: 'Sat', long: 'Saturday' },
  { n: 7, short: 'Sun', long: 'Sunday' },
] as const

const day = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!))
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!
}
const date = z.string().refine(day, 'That is not a date.')

/** `.strict()`: a field for any other pattern is refused, not ignored. */
export const seriesSchema = z
  .object({
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'Pick at least one day.')
      .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
    startsOn: date.nullable().optional(),
    endsOn: date.nullable().optional(),
  })
  .strict()
  .refine((s) => !s.startsOn || !s.endsOn || s.endsOn >= s.startsOn, { message: 'The end comes before the start.', path: ['endsOn'] })

export type SeriesInput = z.input<typeof seriesSchema>
export type Series = z.output<typeof seriesSchema>

/** ISO weekday (Monday 1 … Sunday 7) of a wall date. */
export function isoWeekdayOf(d: string): number {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number]
  const w = new Date(Date.UTC(y, m - 1, dd)).getUTCDay()
  return w === 0 ? 7 : w
}

const addDay = (d: string): string => {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10)
}

/** The first date on or after today (and on or after the start date, if later) that falls on a chosen weekday. */
export function firstOccurrenceDate(weekdays: readonly number[], startsOn: string | null, today: string): string {
  let d = startsOn && startsOn > today ? startsOn : today
  for (let i = 0; i < 7 && !weekdays.includes(isoWeekdayOf(d)); i++) d = addDay(d)
  return d
}

// #293 — a Page's weekly opening hours, in the metro's wall clock. A missing
// day is closed or unstated; a day may hold more than one range.

import { METRO_TIME_ZONE } from '@/lib/metro/metro-time'

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Day = (typeof DAYS)[number]
export interface HoursRange {
  open: string
  close: string
}
export type OpeningHours = Partial<Record<Day, HoursRange[]>>

export const DAY_LABEL: Record<Day, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Validated hours, or null for none. Throws on anything malformed. */
export function parseOpeningHours(value: unknown): OpeningHours | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Opening hours must be a week of days.')
  const out: OpeningHours = {}
  for (const [day, ranges] of Object.entries(value as Record<string, unknown>)) {
    if (!(DAYS as readonly string[]).includes(day)) throw new Error(`Unknown day: ${day}`)
    if (!Array.isArray(ranges)) throw new Error(`${day}: hours must be a list`)
    const valid = ranges.map((r) => {
      const { open, close } = (r ?? {}) as Partial<HoursRange>
      if (!open || !close || !TIME.test(open) || !TIME.test(close)) throw new Error(`${day}: times are HH:MM`)
      if (close <= open) throw new Error(`${day}: closing comes after opening`)
      return { open, close }
    })
    if (valid.length > 0) out[day as Day] = valid
  }
  return Object.keys(out).length > 0 ? out : null
}

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  const suffix = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

/** The week starting today in the metro, each day as one line of text. */
export function weekFromToday(
  hours: OpeningHours | null,
  now: Date = new Date(),
  tz: string = METRO_TIME_ZONE,
): { day: Day; label: string; today: boolean; text: string }[] {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(now).toLowerCase().slice(0, 3)
  const start = DAYS.indexOf(weekday as Day)
  return DAYS.map((_, i) => DAYS[(start + i) % 7]!).map((day, i) => {
    const ranges = hours?.[day] ?? []
    return {
      day,
      label: DAY_LABEL[day],
      today: i === 0,
      text: ranges.length ? ranges.map((r) => `${clock(r.open)}–${clock(r.close)}`).join(', ') : 'Closed',
    }
  })
}

const SHORT: Record<Day, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }

/** #344 — the one line collapsed hours show: open now and when it closes, or
 *  when it next opens. Null when the owner gave no hours. */
export function hoursStatus(
  hours: OpeningHours | null,
  now: Date = new Date(),
  tz: string = METRO_TIME_ZONE,
): { open: boolean; text: string } | null {
  if (!hours) return null
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz })
    .formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  const today = DAYS.indexOf(get('weekday').toLowerCase().slice(0, 3) as Day)
  const time = `${get('hour')}:${get('minute')}`

  const todays = hours[DAYS[today]!] ?? []
  const current = todays.find((r) => r.open <= time && time < r.close)
  if (current) return { open: true, text: `Open now · Closes ${clock(current.close)}` }
  const laterToday = todays.find((r) => r.open > time)
  if (laterToday) return { open: false, text: `Closed · Opens ${clock(laterToday.open)}` }
  for (let i = 1; i <= 7; i++) {
    const day = DAYS[(today + i) % 7]!
    const first = hours[day]?.[0]
    if (first) return { open: false, text: `Closed · Opens ${clock(first.open)} ${SHORT[day]}` }
  }
  return { open: false, text: 'Closed' }
}

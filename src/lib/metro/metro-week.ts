// F093 criterion 5 — the week the signed-out count is over.
//
// The count on a withheld card is "3 announcements this week", and "this week"
// is a wall-clock question in the METRO's timezone: a Sacramento Page's week
// turns over at midnight in Sacramento, whoever is reading. Computed here and
// passed into `announcements_withheld` as two instants, so the zone stays in
// this one directory — #173 gives each metro its own zone, and when it lands
// it changes `metro-time.ts` and this file and no SQL.
//
// ISO weeks, Monday–Sunday, matching `weekRange` in the browse filters. The
// reason there was that "this weekend" must fall inside "this week"; the
// reason here is only that the app should not have two answers to which day a
// week starts on.

import { METRO_TIME_ZONE, metroWallTimeToInstant } from './metro-time'

/**
 * The words on the card. Criterion 5: a count that cannot be read as a period
 * is not a count, so the period is named rather than implied.
 */
export const METRO_WEEK_LABEL = 'this week'

export interface MetroWeek {
  /** Monday 00:00 in the metro, inclusive. */
  from: string
  /** The following Monday 00:00 in the metro, exclusive. */
  to: string
}

/** The calendar date in the metro, as `YYYY-MM-DD`. */
export function metroDate(at: Date, tz: string): string {
  // `en-CA` renders ISO-shaped dates, which is why it is used here rather than
  // assembling parts by hand.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** 0 = Sunday, matching `Date.prototype.getDay`. */
export function metroWeekday(at: Date, tz: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(at)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
}

/** `YYYY-MM-DD` shifted by whole days, without touching a timezone. */
export function shiftDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10)
}

/**
 * The metro week containing `now`.
 *
 * Both ends go through `metroWallTimeToInstant`, so a week that straddles a
 * DST change is still seven calendar days rather than seven times twenty-four
 * hours — the hour that does not exist in March is the reason that matters.
 */
export function metroWeekBounds(now: Date = new Date(), tz: string = METRO_TIME_ZONE): MetroWeek {
  const today = metroDate(now, tz)
  // Sunday is the last day of an ISO week, so it goes back six days, not none.
  const monday = shiftDays(today, -((metroWeekday(now, tz) + 6) % 7))
  return {
    from: metroWallTimeToInstant(monday, '00:00', tz)!,
    to: metroWallTimeToInstant(shiftDays(monday, 7), '00:00', tz)!,
  }
}

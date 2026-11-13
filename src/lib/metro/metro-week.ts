// The metro's calendar: its date, its weekday, and its week, all in the metro's own zone.
//
// ISO weeks, Monday–Sunday, matching `weekRange` in the browse filters, so "this weekend" falls inside "this week"
// and the app has one answer to which day a week starts on. (Written for F093's withheld count, retired by F134;
// the date helpers are read across the app.)

import { METRO_TIME_ZONE, metroWallTimeToInstant } from './metro-time'

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

// F091 — the windows of "What's happening…": today, this week, this weekend.
//
// In the metro's zone and bound to the hour (criterion 2): every row starts
// now, never at a midnight already behind us. Weeks are the ISO weeks
// metro-week.ts uses, so this weekend always falls inside this week.

import { METRO_TIME_ZONE, metroWallTimeToInstant } from './metro-time'
import { metroDate, metroWeekday, shiftDays } from './metro-week'

export interface Window {
  from: string
  to: string
}

export interface HappeningWindows {
  today: Window
  thisWeek: Window
  thisWeekend: Window
}

export function happeningWindows(now: Date = new Date(), tz: string = METRO_TIME_ZONE): HappeningWindows {
  const today = metroDate(now, tz)
  const fromNow = now.toISOString()
  const midnight = (ymd: string) => new Date(metroWallTimeToInstant(ymd, '00:00', tz)!).toISOString()
  // Days to next Monday: Monday 7, Sunday 1.
  const toMonday = 7 - ((metroWeekday(now, tz) + 6) % 7)
  const nextMonday = midnight(shiftDays(today, toMonday))
  const saturday = midnight(shiftDays(today, toMonday - 2))
  return {
    today: { from: fromNow, to: midnight(shiftDays(today, 1)) },
    thisWeek: { from: fromNow, to: nextMonday },
    thisWeekend: { from: saturday > fromNow ? saturday : fromNow, to: nextMonday },
  }
}

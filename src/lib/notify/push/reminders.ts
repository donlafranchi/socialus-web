// #945 — Remind me: the dates a weekly series falls on, which reminder is due when, and what it says. Pure.

import { METRO_TIME_ZONE } from '@/lib/metro/metro-time'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { isoWeekdayOf } from '@/lib/posts/series'
import { NOTIFY_COPY as C } from './copy'
import { inQuietHours, localDay, snippet, zonedTime, type PushMessage } from './rules'

export type Slot = 'evening' | 'hour'

export interface ReminderPrefs {
  remindEvening: boolean
  remindHour: boolean
  paused: boolean
  quietStart: number
  quietEnd: number
}

/** The evening reminder goes at this hour the day before; one missed by more than LATE_MS is not sent. */
export const EVENING_HOUR = 18
const HOUR_MS = 60 * 60 * 1000
const LATE_MS = 3 * HOUR_MS

const wallParts = (at: Date, tz: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: 'numeric', minute: 'numeric' }).formatToParts(at).map((x) => [x.type, x.value]),
  )
  return { h: Number(p.hour), min: Number(p.minute) }
}
const ymd = (d: string) => d.split('-').map(Number) as [number, number, number]
const nextDay = (d: string) => {
  const [y, m, dd] = ymd(d)
  return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10)
}

/** Occurrences of a weekly series that start in [from, to): the first post's wall-clock time and length, on each chosen weekday. */
export function seriesOccurrences(
  series: { weekdays: readonly number[]; startsOn: string | null; endsOn: string | null },
  first: { startsAt: Date; endsAt: Date | null },
  from: Date,
  to: Date,
  tz = METRO_TIME_ZONE,
): { startsAt: Date; endsAt: Date | null }[] {
  const { h, min } = wallParts(first.startsAt, tz)
  const length = first.endsAt ? first.endsAt.getTime() - first.startsAt.getTime() : null
  const firstDay = localDay(first.startsAt, tz)
  const out: { startsAt: Date; endsAt: Date | null }[] = []
  for (let d = localDay(from, tz), last = localDay(to, tz); d <= last; d = nextDay(d)) {
    if (d < firstDay || (series.startsOn && d < series.startsOn) || (series.endsOn && d > series.endsOn)) continue
    if (!series.weekdays.includes(isoWeekdayOf(d))) continue
    const [y, m, dd] = ymd(d)
    const startsAt = zonedTime(y, m, dd, h, min, tz)
    if (startsAt >= from && startsAt < to) out.push({ startsAt, endsAt: length == null ? null : new Date(startsAt.getTime() + length) })
  }
  return out
}

/** Which reminder for this occurrence should go now, if any. Quiet hours and Pause all hold it. */
export function dueSlot(occursAt: Date, now: Date, prefs: ReminderPrefs, sent: ReadonlySet<Slot>, tz = METRO_TIME_ZONE): Slot | null {
  if (prefs.paused || now >= occursAt || inQuietHours(now, prefs.quietStart, prefs.quietEnd, tz)) return null
  const hourAt = occursAt.getTime() - HOUR_MS
  if (now.getTime() >= hourAt) return prefs.remindHour && !sent.has('hour') ? 'hour' : null
  const [y, m, d] = ymd(localDay(occursAt, tz))
  const eveningAt = zonedTime(y, m, d - 1, EVENING_HOUR, 0, tz).getTime()
  if (prefs.remindEvening && !sent.has('evening') && now.getTime() >= eveningAt && now.getTime() - eveningAt <= LATE_MS) return 'evening'
  return null
}

export interface ReminderFacts {
  reminderId: string
  pageName: string
  pagePublicId: string
  body: string
  occursAt: Date
}

export const timeOf = (at: Date, tz = METRO_TIME_ZONE) =>
  new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(at).replace(/\s/g, ' ')
const whenLine = (slot: Slot, at: Date) => (slot === 'evening' ? C.reminderTomorrow(timeOf(at)) : C.reminderInAnHour(timeOf(at)))
export const reminderUrl = (f: ReminderFacts) => `${canonicalPagePath(f.pagePublicId)}?via=reminder&r=${f.reminderId}`

export function reminderMessage(slot: Slot, f: ReminderFacts): PushMessage {
  return { kind: 'reminder', title: f.pageName, body: `${whenLine(slot, f.occursAt)} · ${snippet(f.body, 100)}`, url: reminderUrl(f), tag: `reminder-${f.reminderId}` }
}

export function reminderEmail(slot: Slot, f: ReminderFacts, site: string): { subject: string; text: string } {
  const link = `${site.replace(/\/$/, '')}${reminderUrl(f)}`
  return {
    subject: `${whenLine(slot, f.occursAt)}: ${f.pageName}`,
    text: `${f.pageName}\n${whenLine(slot, f.occursAt)}\n\n${snippet(f.body, 400)}\n\n${link}\n\n${C.reminderEmailStop}`,
  }
}

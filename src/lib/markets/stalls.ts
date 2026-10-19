// #955 — a vendor Page at a market Page: the market's next day, whether a stall is there, and how that is said.
import { METRO_TIME_ZONE } from '@/lib/metro/metro-time'
import { metroDate } from '@/lib/metro/metro-week'
import { seriesOccurrences } from '@/lib/notify/push/reminders'
import { MARKET_COPY as C } from './copy'

export interface MarketSeries {
  weekdays: readonly number[]
  /** Any one market-day post: its wall-clock hours are the market's. */
  first: { startsAt: Date; endsAt: Date | null }
}
export interface StallWhen {
  every_week: boolean
  dates: readonly string[]
  skip_dates: readonly string[]
}
export interface MarketDay {
  ymd: string
  startsAt: Date
  endsAt: Date | null
}

const DAY_MS = 86_400_000

/** The market days from `now` for `weeks` weeks; today counts until it ends. */
export function marketDaysAhead(m: MarketSeries, now: Date, weeks = 1): MarketDay[] {
  const len = m.first.endsAt ? m.first.endsAt.getTime() - m.first.startsAt.getTime() : null
  return seriesOccurrences({ weekdays: m.weekdays, startsOn: null, endsOn: null }, m.first, new Date(now.getTime() - DAY_MS), new Date(now.getTime() + weeks * 7 * DAY_MS + DAY_MS))
    .map((o) => ({ ymd: metroDate(o.startsAt, METRO_TIME_ZONE), startsAt: o.startsAt, endsAt: len == null ? null : new Date(o.startsAt.getTime() + len) }))
    .filter((d) => (d.endsAt ?? d.startsAt) > now)
    .slice(0, weeks)
}

export const nextMarketDay = (m: MarketSeries, now: Date): MarketDay | null => marketDaysAhead(m, now, 1)[0] ?? null

export const attends = (s: StallWhen, ymd: string) => (s.every_week || s.dates.includes(ymd)) && !s.skip_dates.includes(ymd)

const clock = (d: Date) => {
  const [h, m] = new Intl.DateTimeFormat('en-US', { timeZone: METRO_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(d).split(/[: ]/)
  return m === '00' ? h! : `${h}:${m}`
}
export const hoursLabel = (start: Date, end: Date | null) => (end ? `${clock(start)}–${clock(end)}` : clock(start))

const weekdayPlural = (d: Date) => `${new Intl.DateTimeFormat('en-US', { timeZone: METRO_TIME_ZONE, weekday: 'long' }).format(d)}s`
const dateLabel = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: METRO_TIME_ZONE, weekday: 'long', month: 'short', day: 'numeric' }).format(d)

/** The vendor Page's line: every week by weekday, else its next listed date; null when none is ahead. */
export function findUsLine(s: StallWhen, market: string, m: MarketSeries, now: Date): string | null {
  if (s.every_week) {
    const d = nextMarketDay(m, now)
    return d ? C.findUsWeekly(weekdayPlural(d.startsAt), hoursLabel(d.startsAt, d.endsAt), market) : null
  }
  const d = marketDaysAhead(m, now, 52).find((x) => attends(s, x.ymd))
  return d ? C.findUsOn(dateLabel(d.startsAt), hoursLabel(d.startsAt, d.endsAt), market) : null
}

export const stallReminderBody = (market: string, start: Date, end: Date | null) => C.stallReminder(market, hoursLabel(start, end))

export function vendorsLine(names: readonly string[]): string {
  if (!names.length) return ''
  return names.length <= 4 ? C.coming(names.join(', ')) : C.coming(`${names.slice(0, 3).join(', ')} and ${names.length - 3} more`)
}

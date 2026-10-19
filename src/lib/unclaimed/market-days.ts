// Don, 2026-10-19 — a market whose own site states its day and hours gets real "Market day" posts, not Samples:
// one weekly post_series (so Remind me can say "every time") and its next three dates as posts, crediting the source.
// A finished one moves on to the next date not yet posted, the way samples roll.
import { METRO_TIME_ZONE, metroWallTimeToInstant } from '../metro/metro-time'
import { metroDate, metroWeekday, shiftDays } from '../metro/metro-week'
import { SYSTEM_MEMBER_ID } from '../system-member'

export interface MarketSchedule {
  /** ISO weekday, Monday 1 to Sunday 7. */
  weekday: number
  start: string
  end: string
  /** As the operator states it: "Sundays 9 AM–1 PM, year-round". */
  hours: string
  /** The operator's own page that states the day and hours. */
  source: string
}

type Window = { startsAt: Date; endsAt: Date }
interface Db {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

export const MARKET_DAYS_AHEAD = 3
const wall = (ymd: string, hhmm: string) => new Date(metroWallTimeToInstant(ymd, hhmm, METRO_TIME_ZONE)!)

export function marketDays(s: MarketSchedule, now: Date, n = MARKET_DAYS_AHEAD): Window[] {
  const ahead = (s.weekday - metroWeekday(now, METRO_TIME_ZONE) + 7) % 7
  let ymd = shiftDays(metroDate(now, METRO_TIME_ZONE), ahead)
  if (wall(ymd, s.end) <= now) ymd = shiftDays(ymd, 7)
  return Array.from({ length: n }, (_, i) => {
    const d = shiftDays(ymd, i * 7)
    return { startsAt: wall(d, s.start), endsAt: wall(d, s.end) }
  })
}

export const marketDayBody = (name: string, s: MarketSchedule) => `Market day at ${name}. ${s.hours}.\n\nHours from the market's own site: ${s.source}`

/** Makes or moves the Page's market-day posts so its next three dates are posted. Returns how many it wrote. */
export async function syncMarketDays(db: Db, groupId: string, name: string, s: MarketSchedule, photoUrl: string | null, now: Date): Promise<number> {
  const series = await db.query(`select id from public.post_series where group_id = $1 and created_by = $2 order by created_at limit 1`, [groupId, SYSTEM_MEMBER_ID])
  const seriesId =
    (series.rows[0]?.id as string | undefined) ??
    ((await db.query(`insert into public.post_series (group_id, created_by, weekdays) values ($1, $2, $3) returning id`, [groupId, SYSTEM_MEMBER_ID, [s.weekday]])).rows[0]!.id as string)
  const posts = (await db.query(`select id, starts_at, ends_at from public.page_posts where series_id = $1 and dissolved_at is null order by starts_at`, [seriesId])).rows as { id: string; starts_at: Date; ends_at: Date }[]
  const want = marketDays(s, now)
  const have = new Set(posts.map((p) => new Date(p.starts_at).getTime()))
  const missing = want.filter((w) => !have.has(w.startsAt.getTime()))
  const done = posts.filter((p) => new Date(p.ends_at) <= now)
  const body = marketDayBody(name, s)
  let wrote = 0
  for (const w of missing) {
    const old = done.shift()
    if (old) await db.query(`update public.page_posts set starts_at = $2, ends_at = $3, body = $4, updated_at = $5 where id = $1`, [old.id, w.startsAt, w.endsAt, body, now])
    else
      await db.query(
        `insert into public.page_posts (group_id, body, starts_at, ends_at, photo_url, lifecycle_state, discoverability, series_id, created_at, updated_at)
         values ($1, $2, $3, $4, $5, 'active', 'listed', $6, $7, $7)`,
        [groupId, body, w.startsAt, w.endsAt, photoUrl, seriesId, now],
      )
    wrote++
  }
  return wrote
}

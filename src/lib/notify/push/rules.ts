// #904 — when a notification may go, and what it says. Pure: the sender and the tests share it.

import { METRO_TIME_ZONE } from '@/lib/metro/metro-time'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { NOTIFY_COPY } from './copy'

/** The kinds a member turns on or off. Reminders are asked for one post at a time (#945). */
export type NotifyKind = 'follow_posts' | 'weekend'
export const NOTIFY_KINDS: readonly NotifyKind[] = ['follow_posts', 'weekend']
/** Every kind the counts and the review cover. */
export type CountKind = NotifyKind | 'reminder'
export const COUNT_KINDS: readonly CountKind[] = ['follow_posts', 'weekend', 'reminder']

/** At most this many follow-post notifications per member per local day, and this long between them. */
export const DAILY_CAP = 3
export const MIN_GAP_MS = 60 * 60 * 1000
/** A queued post older than this is dropped rather than sent late. */
export const STALE_MS = 36 * 60 * 60 * 1000

export interface Prefs {
  followPosts: boolean
  weekend: boolean
  paused: boolean
  quietStart: number
  quietEnd: number
  /** #945 — when a reminder comes; both on, and only used once a member asks for a reminder. */
  remindEvening: boolean
  remindHour: boolean
}

export const DEFAULT_PREFS: Prefs = { followPosts: false, weekend: false, paused: false, quietStart: 21, quietEnd: 8, remindEvening: true, remindHour: true }

export function localHour(now: Date, tz = METRO_TIME_ZONE): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now))
}

export function localDay(now: Date, tz = METRO_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Quiet from `start` up to `end` (hours, local). Equal means never quiet; start > end wraps past midnight. */
export function inQuietHours(now: Date, start: number, end: number, tz = METRO_TIME_ZONE): boolean {
  if (start === end) return false
  const h = localHour(now, tz)
  return start < end ? h >= start && h < end : h >= start || h < end
}

export function mayReceive(prefs: Prefs, kind: NotifyKind, now: Date): boolean {
  if (prefs.paused) return false
  if (kind === 'follow_posts' ? !prefs.followPosts : !prefs.weekend) return false
  return !inQuietHours(now, prefs.quietStart, prefs.quietEnd)
}

export interface QueuedPost {
  postId: string
  pageName: string
  pagePublicId: string
  body: string
  queuedAt: Date
}

export interface PushMessage {
  kind: CountKind
  title: string
  body: string
  url: string
  tag: string
}

export type FollowPlan =
  | { send: PushMessage; drop: string[] }
  | { hold: true; drop: string[] }

/**
 * One member's queued follow posts → one batched notification, or hold them. `sentToday` are this member's
 * follow-post send times in the current local day; `lastSent` their most recent at all.
 */
export function planFollowSend(
  prefs: Prefs,
  queued: readonly QueuedPost[],
  sentToday: number,
  lastSent: Date | null,
  now: Date,
): FollowPlan {
  const stale = queued.filter((q) => now.getTime() - q.queuedAt.getTime() > STALE_MS).map((q) => q.postId)
  const fresh = queued.filter((q) => !stale.includes(q.postId))
  if (fresh.length === 0) return { hold: true, drop: stale }
  if (!mayReceive(prefs, 'follow_posts', now)) return { hold: true, drop: stale }
  if (sentToday >= DAILY_CAP) return { hold: true, drop: stale }
  if (lastSent && now.getTime() - lastSent.getTime() < MIN_GAP_MS) return { hold: true, drop: stale }
  return { send: followMessage(fresh), drop: stale }
}

export function snippet(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

export function landingUrl(path: string, kind: NotifyKind): string {
  return `${path}${path.includes('?') ? '&' : '?'}via=push-${kind}`
}

export function followMessage(posts: readonly QueuedPost[]): PushMessage {
  const pages = [...new Set(posts.map((p) => p.pageName))]
  if (posts.length === 1) {
    const p = posts[0]!
    return { kind: 'follow_posts', title: NOTIFY_COPY.followOneTitle(p.pageName), body: snippet(p.body), url: landingUrl(canonicalPagePath(p.pagePublicId), 'follow_posts'), tag: 'follow_posts' }
  }
  return {
    kind: 'follow_posts',
    title: NOTIFY_COPY.followManyTitle(posts.length),
    body: NOTIFY_COPY.followManyBody(pages),
    url: landingUrl('/explore?view=updates', 'follow_posts'),
    tag: 'follow_posts',
  }
}

export function weekendMessage(total: number, fromFollowed: number): PushMessage | null {
  if (total <= 0) return null
  return {
    kind: 'weekend',
    title: NOTIFY_COPY.weekendTitle,
    body: NOTIFY_COPY.weekendBody(total, fromFollowed),
    url: landingUrl('/explore?schedule=weekend', 'weekend'),
    tag: 'weekend',
  }
}

/** The coming Friday 00:00 to Monday 00:00, local, as instants. Run on a Thursday it is tomorrow's weekend. */
export function weekendWindow(now: Date, tz = METRO_TIME_ZONE): { from: Date; to: Date } {
  const day = localDay(now, tz)
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const toFriday = (5 - weekday + 7) % 7
  return { from: zonedMidnight(y, m, d + toFriday, tz), to: zonedMidnight(y, m, d + toFriday + 3, tz) }
}

function zonedMidnight(y: number, m: number, d: number, tz: string): Date {
  return zonedTime(y, m, d, 0, 0, tz)
}

/** The instant of that wall-clock time on that calendar day in `tz` (days past the month's end roll over). */
export function zonedTime(y: number, m: number, d: number, h: number, min: number, tz = METRO_TIME_ZONE): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, h, min))
  const offset = tzOffsetMs(guess, tz)
  const first = new Date(guess.getTime() - offset)
  return new Date(guess.getTime() - tzOffsetMs(first, tz))
}

function tzOffsetMs(at: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!)
  return asUtc - at.getTime()
}

/** The member's device, from the browser's user agent: only to say how to get notifications there. */
export function platformOf(userAgent: string): 'ios' | 'android' | 'desktop' | 'other' {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  if (/Macintosh|Windows|Linux|CrOS/i.test(userAgent)) return 'desktop'
  return 'other'
}

/** iOS 16.4 and later deliver web push, and only to a web app opened from the Home Screen. */
export function iosVersion(userAgent: string): number | null {
  const m = /OS (\d+)[_.](\d+)/.exec(userAgent)
  return /iPhone|iPad|iPod/i.test(userAgent) && m ? Number(m[1]) + Number(m[2]) / 100 : null
}

// plan #230 (Don, 2026-10-31): "I need people to see exactly what's being offered or described." A post card
// opens with KIND · WHEN · WHERE, built from fields and never from the body, then a one-line headline.
import { METRO_TIME_ZONE } from '@/lib/metro/metro-time'
import { POST_KIND_WORD, type PostKind } from './kinds'

const DAY = 86_400_000

export interface LeadLineInput {
  kind: PostKind
  startsAt?: string | null
  endsAt?: string | null
  postedAt?: string | null
  where?: string | null
  sample?: boolean
  wonder?: { in: number; threshold: number } | null
}

const parts = (d: Date, tz: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>

const ymd = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** Today; a weekday within the coming six days; else the month and day. */
function dayLabel(d: Date, now: Date, tz: string): string {
  const p = parts(d, tz)
  const days = Math.round((Date.parse(ymd(d, tz)) - Date.parse(ymd(now, tz))) / DAY)
  if (days === 0) return 'Today'
  if (days > -7 && days < 7) return p.weekday!
  return `${p.month} ${p.day}`
}

/** "5pm", "5:30pm". */
function clock(d: Date, tz: string): string {
  const p = parts(d, tz)
  const min = p.minute === '00' ? '' : `:${p.minute}`
  return `${p.hour}${min}${(p.dayPeriod ?? '').toLowerCase()}`
}

function timeRange(start: Date, end: Date | null, tz: string): string {
  const a = clock(start, tz)
  if (!end || ymd(end, tz) !== ymd(start, tz) || end <= start) return a
  const b = clock(end, tz)
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -2)}–${b}` : `${a}–${b}`
}

const valid = (iso: string | null | undefined): Date | null => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function when(p: LeadLineInput, now: Date, tz: string): string | null {
  const start = valid(p.startsAt)
  const end = valid(p.endsAt)
  switch (p.kind) {
    case 'event':
    case 'reminder':
      return start ? `${dayLabel(start, now, tz)} ${timeRange(start, end, tz)}` : null
    case 'sale': {
      const through = end ?? (start ? new Date(start.getTime() + 7 * DAY) : null)
      return through ? `Through ${dayLabel(through, now, tz)}` : null
    }
    case 'wonder':
      return p.wonder && p.wonder.threshold > 0 ? `${p.wonder.in} of ${p.wonder.threshold}` : null
    default: {
      const posted = valid(p.postedAt)
      return posted ? dayLabel(posted, now, tz) : null
    }
  }
}

/** "Event · Sat 5–8pm · Midtown". The card sets it in small caps; samples read "Sample sale · …". */
export function leadLine(p: LeadLineInput, now: Date = new Date(), tz: string = METRO_TIME_ZONE): string {
  const word = POST_KIND_WORD[p.kind]
  const kind = p.sample ? `Sample ${word.toLowerCase()}` : word
  return [kind, when(p, now, tz), p.where?.trim() || null].filter(Boolean).join(' · ')
}

const SAMPLE_PREFIX = /^sample\s*[·:\-–—]\s*/i

/** The card's one line: the headline, else (an older post) the first sentence of the body without a leading
 *  "Sample · " or the Page's own name. The card truncates it to one line. */
export function cardHeadline(p: { headline?: string | null; body: string | null; pageName: string }): string {
  const h = p.headline?.trim()
  if (h) return h
  const firstLine = (p.body ?? '').trim().split('\n')[0]!.trim()
  let s = firstLine.replace(SAMPLE_PREFIX, '')
  const name = p.pageName.trim()
  if (name && s.toLowerCase().startsWith(name.toLowerCase())) {
    const rest = s.slice(name.length).replace(/^\s*[:·,\-–—]\s*/, '')
    if (rest) s = rest.charAt(0).toUpperCase() + rest.slice(1)
  }
  const sentence = /^(.+?[.!?])(\s|$)/.exec(s)
  return (sentence ? sentence[1]! : s).trim()
}

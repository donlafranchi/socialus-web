// plan #230 (Don, 2026-10-31): "I need people to see exactly what's being offered or described." A post card
// opens with KIND · WHEN · WHERE, built from fields and never from the body, then a one-line headline.
import { METRO_TIME_ZONE } from '@/lib/metro/metro-time'
import { classifyEvent, type EventType } from '@/lib/unclaimed/event-type'
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
  /** #1127 — an imported venue show: the lead line names the kind of show and the venue is its where. */
  show?: { type: EventType; venue: string } | null
}

/** #1127 — the kind word for a venue show. Draft copy (human-review). */
export const SHOW_WORD: Partial<Record<EventType, string>> = {
  music: 'Live music',
  comedy: 'Comedy',
  theater: 'Theater',
  sports: 'Sports',
  family: 'Family',
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
    case 'limited':
      return start ? `${dayLabel(start, now, tz)} ${clock(start, tz)}` : posted(p, now, tz)
    case 'sale': {
      const through = end ?? (start ? new Date(start.getTime() + 7 * DAY) : null)
      return through ? `Through ${dayLabel(through, now, tz)}` : null
    }
    case 'wonder':
      return p.wonder && p.wonder.threshold > 0 ? `${p.wonder.in} of ${p.wonder.threshold}` : null
    default:
      return posted(p, now, tz)
  }
}

function posted(p: LeadLineInput, now: Date, tz: string): string | null {
  const at = valid(p.postedAt)
  return at ? dayLabel(at, now, tz) : null
}

/** "Event · Sat 5–8pm · Midtown". The card sets it in small caps; samples read "Sample sale · …". */
export function leadLine(p: LeadLineInput, now: Date = new Date(), tz: string = METRO_TIME_ZONE): string {
  const { head, where } = leadLineParts(p, now, tz)
  return where ? `${head} · ${where}` : head
}

/** #1127 — the lead line as what · when (kept whole) and where (the part a narrow card cuts short). */
export function leadLineParts(p: LeadLineInput, now: Date = new Date(), tz: string = METRO_TIME_ZONE): { head: string; where: string | null } {
  const word = (p.show && SHOW_WORD[p.show.type]) || POST_KIND_WORD[p.kind]
  const kind = p.sample ? `Sample ${word.toLowerCase()}` : word
  return { head: [kind, when(p, now, tz)].filter(Boolean).join(' · '), where: (p.show?.venue ?? p.where)?.trim() || null }
}

/** #1127 — an imported venue show (venue-events showBody), known by its calendar line; null for anything a member wrote. */
export function venueShow(p: { body: string | null | undefined; tags: readonly string[] }): { type: EventType; venue: string } | null {
  const venue = p.body ? CALENDAR_RE.exec(p.body)?.[1]?.trim() : null
  if (!venue) return null
  const title = p.body!.split('\n')[0]!.replace(new RegExp(` at ${escapeRe(venue)}$`), '')
  return { type: classifyEvent(title, p.tags), venue }
}

// CALENDAR_LINE as a pattern; the test builds its body with CALENDAR_LINE, so the two cannot drift apart unseen.
const CALENDAR_RE = /\n\nFrom (.+?)'s own calendar: /

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A sample body's opening "Sample · ": the lead line says it, so the card and the Page drop it from the words below. */
export const SAMPLE_PREFIX = /^sample\s*[·:\-–—]\s*/i

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
  if (name) s = s.replace(new RegExp(`\\s+at\\s+${escapeRe(name)}\\.?$`, 'i'), '')
  const sentence = /^(.+?[.!?])(\s|$)/.exec(s)
  return (sentence ? sentence[1]! : s).trim()
}

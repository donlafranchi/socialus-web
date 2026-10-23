// #997 (Don, 2026-10-22) — a venue's real shows, read from its own events page, become dated posts on its Page:
// the next 60 days, one post per venue + date + title, a ticket link and credit to the source. Never an aggregator.
import { METRO_TIME_ZONE, metroWallTimeToInstant } from '../metro/metro-time'
import { metroDate } from '../metro/metro-week'

export interface VenueShow {
  title: string
  startsAt: Date
  doorsAt?: Date
  ticketUrl?: string
  cancelled?: boolean
}

export type EventsFormat = 'jsonld' | 'ical' | 'tribe' | 'html'
export interface VenueEvents {
  /** The venue's own events page or feed. */
  url: string
  format: EventsFormat
  /** For `html`: which parser in HTML_PARSERS reads it. */
  parser?: string
  /** Where the post credits, when the feed is not the page people read (defaults to url). */
  page?: string
}

export const SHOWS_AHEAD_DAYS = 60
const AGGREGATORS = /(^|\.)(songkick|bandsintown|eventbrite|jambase|allevents|seatgeek|stubhub|vividseats)\.com$/i

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…' }
export const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** An instant from a feed's date: with an offset it is exact; without one it is the metro's wall clock; a bare date is no time at all. */
export function instant(s: string | undefined | null): Date | null {
  if (!s) return null
  const v = s.trim()
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(v) && /T|\s\d/.test(v)) {
    const d = new Date(v.replace(' ', 'T'))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})/.exec(v)
  if (!m) return null
  const iso = metroWallTimeToInstant(m[1]!, m[2]!, METRO_TIME_ZONE)
  return iso ? new Date(iso) : null
}

/** A door time may be a full date-time or just "19:00" on the show's day. */
function doors(v: unknown, start: Date): Date | undefined {
  if (typeof v !== 'string') return undefined
  const t = /^(\d{1,2}):(\d{2})/.exec(v.trim())
  const d = t ? instant(`${metroDate(start, METRO_TIME_ZONE)}T${t[1]!.padStart(2, '0')}:${t[2]}`) : instant(v)
  return d && d <= start ? d : undefined
}

const abs = (u: unknown, base: string) => {
  if (typeof u !== 'string' || !u.trim()) return undefined
  try {
    const url = new URL(decode(u), base)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function offerUrl(offers: unknown, base: string): string | undefined {
  for (const o of Array.isArray(offers) ? offers : [offers]) if (o && typeof o === 'object' && (o as { url?: unknown }).url) return abs((o as { url: unknown }).url, base)
  return undefined
}

/** schema.org Event objects in the page's JSON-LD, wherever they sit (arrays, @graph, nested). */
export function parseJsonLd(html: string, base: string): VenueShow[] {
  const shows: VenueShow[] = []
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    const o = n as Record<string, unknown>
    const type = ([] as unknown[]).concat(o['@type'] ?? []).map(String)
    if (type.some((t) => /Event$/.test(t)) && typeof o.name === 'string') {
      const startsAt = instant(o.startDate as string)
      if (startsAt)
        shows.push({
          title: decode(o.name),
          startsAt,
          doorsAt: doors(o.doorTime, startsAt),
          ticketUrl: offerUrl(o.offers, base) ?? abs(o.url, base),
          cancelled: /Cancelled|Postponed/i.test(String(o.eventStatus ?? '')),
        })
      return
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v)
  }
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1]!.trim()))
    } catch {
      // A malformed block on an otherwise good page is skipped, not fatal.
    }
  }
  return shows
}

/** VEVENTs from an iCal feed; all-day entries have no show time and are left out. */
export function parseIcal(text: string, base: string): VenueShow[] {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  const shows: VenueShow[] = []
  let ev: Record<string, string> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') ev = {}
    else if (line === 'END:VEVENT' && ev) {
      const startsAt = icalTime(ev.DTSTART)
      if (startsAt && ev.SUMMARY) shows.push({ title: decode(ev.SUMMARY.replace(/\\([,;\\])/g, '$1')), startsAt, ticketUrl: abs(ev.URL, base), cancelled: /CANCELLED/i.test(ev.STATUS ?? '') })
      ev = null
    } else if (ev) {
      const i = line.indexOf(':')
      if (i > 0) ev[line.slice(0, i).split(';')[0]!.toUpperCase()] = line.slice(i + 1) + (line.slice(0, i).includes('VALUE=DATE') && !line.includes('VALUE=DATE-TIME') ? '|date' : '')
    }
  }
  return shows
}

function icalTime(v: string | undefined): Date | null {
  if (!v || v.endsWith('|date')) return null
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v)
  if (!m) return null
  return m[7] ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`) : instant(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`)
}

/** The Events Calendar's REST API on the venue's own WordPress site (/wp-json/tribe/events/v1/events). */
export function parseTribe(json: unknown, base: string): VenueShow[] {
  const events = ((json as { events?: unknown[] })?.events ?? []) as Record<string, unknown>[]
  return events.flatMap((e) => {
    const startsAt = instant((e.utc_start_date ? `${e.utc_start_date}Z` : e.start_date) as string)
    if (!startsAt || e.all_day === true || typeof e.title !== 'string') return []
    return [{ title: decode(e.title), startsAt, ticketUrl: abs(e.website, base) ?? abs(e.url, base), cancelled: /cancel/i.test(String(e.status ?? '')) }]
  })
}

/** Per-venue readers for an events page with no structured data. Each returns [] when the page has changed shape. */
export const HTML_PARSERS: Record<string, (html: string, base: string) => VenueShow[]> = {}

export function parseShows(src: VenueEvents, body: string): VenueShow[] {
  switch (src.format) {
    case 'jsonld':
      return parseJsonLd(body, src.url)
    case 'ical':
      return parseIcal(body, src.url)
    case 'tribe':
      return parseTribe(JSON.parse(body), src.url)
    case 'html': {
      const p = src.parser && HTML_PARSERS[src.parser]
      if (!p) throw new Error(`no HTML parser named ${src.parser}`)
      return p(body, src.url)
    }
  }
}

export function isAggregator(url: string): boolean {
  try {
    return AGGREGATORS.test(new URL(url).hostname)
  } catch {
    return true
  }
}

const norm = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
/** One post per venue + night + title: the same show re-read tomorrow is the same post. */
export const showKey = (s: VenueShow) => `${metroDate(s.startsAt, METRO_TIME_ZONE)}|${norm(s.title)}`

const clock = (d: Date) =>
  new Intl.DateTimeFormat('en-US', { timeZone: METRO_TIME_ZONE, hour: 'numeric', minute: '2-digit' }).format(d).replace(':00', '')

/** The post's words; its date sits on the post's own when line, and its ticket link on its own Tickets link. */
export function showBody(venue: string, s: VenueShow, source: string): string {
  const times = [...(s.doorsAt ? [`Doors ${clock(s.doorsAt)}`] : []), `Show ${clock(s.startsAt)}`].join(' · ')
  return [`${s.title} at ${venue}`, times, `From ${venue}'s own calendar: ${source}`].join('\n\n')
}

/** The shows to post: ahead of now, within the horizon, not cancelled, one per key, ticket links off aggregators kept (a venue's own pick). */
export function upcoming(shows: VenueShow[], now: Date, days = SHOWS_AHEAD_DAYS): VenueShow[] {
  const until = now.getTime() + days * 86400_000
  const seen = new Map<string, VenueShow>()
  for (const s of shows) if (!s.cancelled && s.startsAt > now && s.startsAt.getTime() <= until && !seen.has(showKey(s))) seen.set(showKey(s), s)
  return [...seen.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

interface Db {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>
}
export interface SyncTally {
  added: number
  updated: number
  removed: number
  kept: number
}

/**
 * Posts the venue's upcoming shows on its Page and takes off the ones that are over, cancelled, or no longer listed.
 * Real posts (no sample_kind), keyed by event_key so a re-run changes nothing. `shows` is everything the feed listed.
 */
export async function syncVenueShows(db: Db, groupId: string, venue: string, source: string, shows: VenueShow[], photoUrl: string | null, now: Date): Promise<SyncTally> {
  const want = upcoming(shows, now)
  const cancelled = new Set(shows.filter((s) => s.cancelled).map(showKey))
  const have = (await db.query(`select id, event_key, starts_at, body, ticket_url from public.page_posts where group_id = $1 and event_key is not null`, [groupId])).rows as { id: string; event_key: string; starts_at: Date; body: string; ticket_url: string | null }[]
  const byKey = new Map(have.map((h) => [h.event_key, h]))
  const tally: SyncTally = { added: 0, updated: 0, removed: 0, kept: 0 }
  for (const s of want) {
    const key = showKey(s)
    const body = showBody(venue, s, source)
    const old = byKey.get(key)
    byKey.delete(key)
    if (!old) {
      await db.query(
        `insert into public.page_posts (group_id, body, starts_at, photo_url, lifecycle_state, discoverability, event_key, ticket_url, created_at, updated_at)
         values ($1, $2, $3, $4, 'active', 'listed', $5, $7, $6, $6)
         on conflict (group_id, event_key) where event_key is not null do nothing`,
        [groupId, body, s.startsAt, photoUrl, key, now, s.ticketUrl ?? null],
      )
      tally.added++
    } else if (new Date(old.starts_at).getTime() !== s.startsAt.getTime() || old.body !== body || old.ticket_url !== (s.ticketUrl ?? null)) {
      await db.query(`update public.page_posts set starts_at = $2, body = $3, ticket_url = $5, updated_at = $4 where id = $1`, [old.id, s.startsAt, body, now, s.ticketUrl ?? null])
      tally.updated++
    } else tally.kept++
  }
  // What is left: over, cancelled, or gone from the venue's calendar. A show still ahead but past the horizon stays.
  const until = now.getTime() + SHOWS_AHEAD_DAYS * 86400_000
  const gone = [...byKey.values()].filter((h) => new Date(h.starts_at) <= now || cancelled.has(h.event_key) || new Date(h.starts_at).getTime() <= until)
  if (gone.length) {
    await db.query(`delete from public.page_posts where id = any($1::uuid[])`, [gone.map((g) => g.id)])
    tally.removed = gone.length
  }
  return tally
}

export const IMPORT_UA = 'SocialUsBot/1.0 (+https://socialus.org; venue calendars)'

/** robots.txt: the group for our agent, else `*`; the longest matching Allow/Disallow wins (RFC 9309). */
export function robotsAllows(robots: string, path: string, ua = 'SocialUsBot'): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = []
  let cur: (typeof groups)[number] | null = null
  let lastWasAgent = false
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line)
    if (!m) continue
    const [k, v] = [m[1]!.toLowerCase(), m[2]!.trim()]
    if (k === 'user-agent') {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }))
      cur.agents.push(v.toLowerCase())
      lastWasAgent = true
    } else {
      lastWasAgent = false
      if (cur && (k === 'allow' || k === 'disallow') && v) cur.rules.push({ allow: k === 'allow', path: v })
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && ua.toLowerCase().includes(a)))
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules)
  const re = (p: string) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'))
  const hits = rules.filter((r) => re(r.path).test(path)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))
  return hits[0]?.allow ?? true
}

/** #997 — each upcoming imported show on this venue, reminded for every member who asked for all its shows. Idempotent. */
export async function remindVenueFollowers(db: Db, groupId: string, now: Date): Promise<number> {
  const r = await db.query(
    `insert into public.post_reminders (member_id, post_id, created_at)
     select r.member_id, p.id, $2::timestamptz
       from public.post_reminders r join public.page_posts p on p.group_id = r.shows_group_id
      where r.shows_group_id = $1 and p.event_key is not null and p.sample_kind is null and p.lifecycle_state = 'active'
        and p.dissolved_at is null and p.hidden_at is null and p.removed_at is null and p.starts_at > $2
     on conflict do nothing`,
    [groupId, now],
  )
  return r.rowCount ?? 0
}

// #997 (Don, 2026-10-22) — a venue's real shows, read from its own events page, become dated posts on its Page:
// the next 60 days, one post per venue + date + title, a ticket link and credit to the source. Never an aggregator.
import { METRO_TIME_ZONE, metroWallTimeToInstant } from '../metro/metro-time'
import { metroDate } from '../metro/metro-week'
import { SYSTEM_MEMBER_ID } from '../system-member'
import { classifyEvent, EVENT_INTERESTS, type EventType } from './event-type'

export interface VenueShow {
  title: string
  startsAt: Date
  doorsAt?: Date
  ticketUrl?: string
  /** The venue's own picture for this show (JSON-LD `image`, the listing photo). */
  imageUrl?: string
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

/** schema.org `image`: a URL, an ImageObject, or a list of either. */
function imageOf(v: unknown, base: string): string | undefined {
  for (const i of Array.isArray(v) ? v : [v]) {
    const u = abs(i && typeof i === 'object' ? (i as { url?: unknown }).url : i, base)
    if (u) return u
  }
  return undefined
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
          imageUrl: imageOf(o.image, base),
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
    return [{ title: decode(e.title), startsAt, ticketUrl: abs(e.website, base) ?? abs(e.url, base), imageUrl: imageOf((e.image as { url?: unknown } | undefined)?.url ?? e.image, base), cancelled: /cancel/i.test(String(e.status ?? '')) }]
  })
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const monthOf = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase())

/** "7:30 pm", "8 PM", "5:00pm" as "HH:MM"; nothing else is a time. */
export function clock24(s: string | undefined): string | null {
  const m = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i.exec(s ?? '')
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return null
  return `${String((Number(m[1]) % 12) + (m[3]!.toLowerCase() === 'p' ? 12 : 0)).padStart(2, '0')}:${m[2] ?? '00'}`
}

/**
 * The date of a year-less "Oct 24" listing: the year that puts it from 45 days ago to 320 days ahead of now.
 * When the site also prints a weekday it must match, so a typo on the venue's page is left out, not guessed at.
 */
export function dateOf(month: string, day: number | string, now: Date, weekday?: string): string | null {
  const m = monthOf(month)
  if (m < 0) return null
  for (const y of [now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
    const d = new Date(Date.UTC(y, m, Number(day), 12))
    if (d.getUTCMonth() !== m || d.getUTCDate() !== Number(day)) continue
    const ahead = (d.getTime() - now.getTime()) / 86400_000
    if (ahead < -45 || ahead > 320) continue
    if (weekday && WEEKDAYS[d.getUTCDay()] !== weekday.slice(0, 3).toLowerCase()) continue
    return d.toISOString().slice(0, 10)
  }
  return null
}

const at = (date: string | null, time: string | null) => (date && time ? instant(`${date}T${time}`) : null)
const CANCELLED = /^(cancell?ed|postponed)\s*:\s*/i
const tag = (html: string, re: RegExp) => {
  const m = re.exec(html)
  return m ? decode(m[1]!) : undefined
}
const itemsOf = (html: string, marker: string | RegExp) => html.split(marker).slice(1)

/** Harlow's and the Starlet Room share one RockHouse list; each keeps its own room. Doors-only shows start at doors. */
const rhp = (room: string) => (html: string, base: string, now = new Date()): VenueShow[] =>
  itemsOf(html, 'eventMainWrapper').flatMap((p) => {
    const venue = /class="venueLink" href="([^"]+)"/.exec(p)?.[1]
    if (!venue || new URL(venue, base).pathname !== room) return []
    const d = /eventMonth[^>]*>\s*([A-Za-z]{3}), ([A-Za-z]{3}) (\d{1,2})\s*</.exec(p)
    const times = /font0by75 fontWeight500[^>]*>\s*([^<]*?)\s*</.exec(p)?.[1] ?? ''
    const date = d ? dateOf(d[2]!, d[3]!, now, d[1]) : null
    const doors = at(date, clock24(/Doors:\s*([^/]*)/i.exec(times)?.[1]))
    const show = at(date, clock24(/Show:\s*(.*)/i.exec(times)?.[1]))
    const startsAt = show ?? doors
    const raw = tag(p, /rhp-event__title--grid[^>]*>\s*([^<]*?)\s*</)
    if (!startsAt || !raw) return []
    const ticket = /rhp-event-cta[^>]*>\s*<a\b[^>]*\bhref="([^"]+)"/.exec(p)?.[1] ?? /class="url" href="([^"]+)"/.exec(p)?.[1]
    return [{ title: raw.replace(CANCELLED, ''), startsAt, doorsAt: show && doors && doors < show ? doors : undefined, ticketUrl: abs(ticket, base), cancelled: CANCELLED.test(raw) || /rhp-event-cta Cancel/i.test(p) }]
  })

const withSupport = (title: string, support?: string) => (support ? `${title} with ${support}` : title)

/** A numeric-month-name date "October 25, 2026". */
const longDate = (s: string) => {
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(s)
  return m && monthOf(m[1]!) >= 0 ? `${m[3]}-${String(monthOf(m[1]!) + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}` : null
}

/** Per-venue readers for an events page with no structured data. Each returns [] when the page has changed shape. */
export type HtmlParser = (html: string, base: string, now?: Date, pages?: Record<string, string>) => VenueShow[]
export const HTML_PARSERS: Record<string, HtmlParser> = {
  // Harlow's (harlows.com/events/, RockHouse Partners): dates carry a weekday, times read "Doors: 7 pm // Show: 8 pm".
  'harlows-rhp': rhp('/venue/harlows/'),
  'harlows-rhp-starlet': rhp('/venue/the-starlet-room/'),

  // Golden 1 Center (EventChamp): each event once per tab, a multi-date run lists every date in a popup.
  'golden1-eventchamp': (html, base) => {
    const seen = new Set<string>()
    return itemsOf(html, '<div class="gt-event-style-1"').flatMap((b) => {
      const id = /data-event-id="(\d+)"/.exec(b)?.[1]
      if (!id || seen.has(id)) return []
      seen.add(id)
      const a = /gt-title"><a href="([^"]+)">([^<]*)/.exec(b)
      if (!a) return []
      const runs = [...b.matchAll(/<li><strong>([^<]*)<\/strong>\s*\/\s*([^<]*)<\/li>/g)].map((m) => [m[1]!, m[2]!])
      const imageUrl = abs(/<img\b(?=[^>]*wp-post-image)[^>]*\ssrc="([^"]+)"/.exec(b)?.[1], base)
      const single = [[/gt-start-date"><span>([^<]*)/.exec(b)?.[1] ?? '', /gt-start-time"><span>([^<]*)/.exec(b)?.[1] ?? '']]
      return (runs.length ? runs : single).flatMap(([d, t]) => {
        const startsAt = at(longDate(d!), clock24(t))
        return startsAt ? [{ title: decode(a[2]!), startsAt, ticketUrl: abs(a[1], base), imageUrl }] : []
      })
    })
  },

  // Goldfield Trading Post (home page): "Saturday / Oct 24", only the doors time, a SeeTickets button.
  goldfield: (html, base, now = new Date()) =>
    itemsOf(html, '<article').flatMap((a) => {
      if (!a.includes('events-list')) return []
      const day = /class="monospace mud">\s*([A-Za-z]+)/.exec(a)?.[1]
      const md = /<h4>\s*([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})\s*<\/h4>/.exec(a)
      const startsAt = at(md ? dateOf(md[1]!, md[2]!, now, day) : null, clock24(/class="time monospace">([\s\S]*?)<\/div>/.exec(a)?.[1]))
      const link = /<h3><a href="([^"]+)">([^<]*)/.exec(a)
      if (!startsAt || !link) return []
      const tickets = /<a class="large-cta"[^>]*href="([^"]+)"/.exec(a)?.[1]
      return [{ title: withSupport(decode(link[2]!), tag(a, /class="support">([^<]*)</)), startsAt, ticketUrl: abs(tickets ?? link[1], base) }]
    }),

  // The Old Ironsides (home page): full date, start time, SeeTickets button.
  'old-ironsides': (html, base) =>
    itemsOf(html, 'class="event-list-item"').flatMap((e) => {
      const link = /<h3><a href="([^"]+)">([^<]*)/.exec(e)
      const startsAt = at(longDate(/event-date monospace">\s*([^<]*?)\s*</.exec(e)?.[1] ?? ''), clock24(/class="time start">([^<]*)/.exec(e)?.[1]))
      if (!startsAt || !link) return []
      return [{ title: withSupport(decode(link[2]!), tag(e, /<h4>([^<]*)<\/h4>/)), startsAt, ticketUrl: abs(/class="ticket-cta[^"]*" href="([^"]+)"/.exec(e)?.[1] ?? link[1], base) }]
    }),

  // The Sofia (bstreettheatre.org/shows/): the music series only. The list has a day, never a time; each detail page says
  // "music series - Title - 11/13/2026 at 7:00 pm" (HTML_FOLLOW below fetches those). No detail page, no show.
  'sofia-music': (html, base, _now, pages = {}) =>
    sofiaMusic(html, base).flatMap((m) => {
      const d = /(\d{1,2})\/(\d{1,2})\/(\d{4}) at (\d{1,2}:\d{2}\s*[ap]m)/i.exec(pages[m.url] ?? '')
      const startsAt = d ? at(`${d[3]}-${d[1]!.padStart(2, '0')}-${d[2]!.padStart(2, '0')}`, clock24(d[4])) : null
      return startsAt ? [{ title: m.title, startsAt, ticketUrl: m.url }] : []
    }),

  // Fox & Goose: shows are lines of the month's post, "October 23 – Dave Berner at 6:00 PM" (HTML_FOLLOW fetches the month).
  'foxandgoose-monthly': (_html, base, now = new Date(), pages = {}) =>
    Object.values(pages).flatMap((page) =>
      [...page.matchAll(/<p>\s*🎶\s*([\s\S]*?)<\/p>/g)].flatMap((l) => {
        const m = /^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*[–-]\s*(.+?)\s*(?:\||\bat\b)\s*(\d{1,2}(?::\d{2})?\s*[AP]M)/i.exec(decode(l[1]!))
        const startsAt = m ? at(dateOf(m[1]!, m[2]!, now), clock24(m[4])) : null
        return m && startsAt ? [{ title: m[3]!.trim(), startsAt, ticketUrl: abs(/href="([^"]+)"/.exec(l[1]!)?.[1], base) }] : []
      }),
    ),

  // The Center for the Arts (JetEngine grid): "Oct" "24" "Sat | 5:00pm" and a titled link; the ad card has no date.
  'centerforthearts-jet': (html, base, now = new Date()) =>
    itemsOf(html, '<div class="jet-listing-grid__item ').flatMap((i) => {
      const f = [...i.matchAll(/jet-listing-dynamic-field__content">([^<]+)</g)].map((m) => m[1]!.trim())
      const wt = /^([A-Za-z]{3})\s*\|\s*(\d{1,2}:\d{2}\s*[ap]m)/i.exec(f[2] ?? '')
      const link = /<h2 class="elementor-heading-title[^>]*><a href="([^"]+)"[^>]*>([^<]+)</.exec(i)
      const startsAt = f[0] && f[1] && wt ? at(dateOf(f[0], f[1], now, wt[1]), clock24(wt[2])) : null
      return startsAt && link ? [{ title: decode(link[2]!), startsAt, ticketUrl: abs(link[1], base) }] : []
    }),

  // Harris Center (/events?showAll=1): "Tue, Oct 27 - 7:30 PM"; runs ("Wed, Nov 4 - Sun, Nov 8") have no show time and are left out.
  'harris-center': (html, base, now = new Date()) =>
    itemsOf(html, 'listing-box _event').flatMap((e) => {
      const link = /<h3 class="primary-text">\s*<a href="([^"]+)">([^<]+)</.exec(e)
      const m = /<strong>([A-Za-z]{3}), ([A-Za-z]{3}) (\d{1,2}) - (\d{1,2}:\d{2} [AP]M)<\/strong>/.exec(e)
      const startsAt = m ? at(dateOf(m[2]!, m[3]!, now, m[1]), clock24(m[4])) : null
      return startsAt && link ? [{ title: decode(link[2]!), startsAt, ticketUrl: abs(link[1], base) }] : []
    }),

  // Nevada Theatre (Modern Events Calendar): the year is in the month divider's class (mec-toggle-202610), the day reads "24 Oct".
  'nevada-theatre-mec': (html, base) =>
    itemsOf(html, '<article').flatMap((a) => {
      if (!a.includes('mec-event-article')) return []
      const ym = /mec-toggle-(\d{4})(\d{2})/.exec(a)
      const dm = /mec-event-d">(?:<i[^>]*><\/i>)?\s*(\d{1,2}) ([A-Za-z]{3})/.exec(a)
      const venue = tag(a, /mec-venue-details[\s\S]*?<span>([^<]*)<\/span>/)
      const link = /mec-event-title"><a [^>]*href="([^"]+)"[^>]*>([^<]*)</.exec(a)
      const date = ym && dm && monthOf(dm[2]!) >= 0 ? `${ym[1]}-${String(monthOf(dm[2]!) + 1).padStart(2, '0')}-${dm[1]!.padStart(2, '0')}` : null
      const startsAt = at(date, clock24(/mec-start-time">([^<]*)/.exec(a)?.[1]))
      return startsAt && link && (!venue || /nevada theatre/i.test(venue)) ? [{ title: decode(link[2]!), startsAt, ticketUrl: abs(link[1], base) }] : []
    }),

  // Powerhouse Pub (Elementor loop): "Sunday" "October 25" "Starts @ 3:00 pm", title link, band line. A weekday that
  // does not match its date (a typo on the page) leaves the show out.
  'powerhouse-elementor': (html, base, now = new Date()) =>
    itemsOf(html, 'e-loop-item e-loop-item-').flatMap((raw) => {
      const i = raw.split('elementor-button-text')[0]!
      const day = /<p class="elementor-heading-title[^>]*>([A-Za-z]+day)</.exec(i)?.[1]
      const md = /<h5 class="elementor-heading-title[^>]*>\s*([A-Za-z]+)\s+(\d{1,2})\s*</.exec(i)
      const startsAt = at(md ? dateOf(md[1]!, md[2]!, now, day) : null, clock24(/Starts @\s*([^<]*)/.exec(i)?.[1]))
      const link = /<h5 class="elementor-heading-title[^>]*><a href="([^"]+)">([^<]*)<\/a><\/h5>([\s\S]*)/.exec(i)
      if (!startsAt || !link) return []
      const band = tag(link[3]!, /<h5 class="elementor-heading-title[^>]*>([^<]+)<\/h5>/)
      return [{ title: decode(link[2]!) + (band && !/^(tba|tbd)$/i.test(band) ? ` – ${band}` : ''), startsAt, ticketUrl: abs(link[1], base) }]
    }),

  // Channel 24 (channel24sac.com/calendar/): one <article class="event"> per show, start as microdata "YYYY-MM-DD HH:MM".
  channel24: (html, base) =>
    html.split(/<article\b[^>]*class="[^"]*\bevent\b/).slice(1).flatMap((a) => {
      const title = /class="[^"]*show-title[^"]*"[^>]*>([\s\S]*?)<\/h2>/.exec(a)?.[1]
      const start = /class="[^"]*event__start-date[^"]*"[^>]*content="([^"]+)"/.exec(a)?.[1]
      const startsAt = instant(start)
      if (!title || !startsAt) return []
      const support = /class="[^"]*bottomline[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(a)?.[1]
      const d = /event__doors-open[^>]*>\s*(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(a)
      const doorsAt = d ? instant(`${metroDate(startsAt, METRO_TIME_ZONE)}T${String((Number(d[1]) % 12) + (/pm/i.test(d[3]!) ? 12 : 0)).padStart(2, '0')}:${d[2]}`) ?? undefined : undefined
      // The tickets button, or "Sold out" linking the venue's own show page.
      const ticket = /event-data[\s\S]*?<a\b[^>]*href="([^"]+)"/.exec(a)
      const name = decode(title) + (support && decode(support) ? ` with ${decode(support)}` : '')
      return [{ title: name, startsAt, doorsAt: doorsAt && doorsAt <= startsAt ? doorsAt : undefined, ticketUrl: abs(ticket?.[1], base) }]
    }),
}

/** The music series on The Sofia's list: title, link and the day (no time, no year). */
function sofiaMusic(html: string, base: string): { url: string; title: string; month: string; day: string }[] {
  const from = html.indexOf('id="music"')
  const section = from < 0 ? '' : html.slice(from, html.indexOf('id="more"', from) < 0 ? undefined : html.indexOf('id="more"', from))
  const seen = new Set<string>()
  return itemsOf(section, 'class="show-module ').flatMap((m) => {
    const url = abs(/class="ticket-button[^"]*"><a href="([^"]+)"/.exec(m)?.[1], base)
    const t = /class="production-title[^>]*>([\s\S]*?)<\/div>/.exec(m)?.[1]
    const d = /class="production-date[^>]*>\s*([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})\s*</.exec(m)
    if (!url || !t || !d || seen.has(url)) return []
    seen.add(url)
    const sub = decode(/<br>\s*<small>([\s\S]*?)<\/small>/.exec(t)?.[1] ?? '')
    const main = decode(t.replace(/<small>[\s\S]*?<\/small>/g, ''))
    return [{ url, title: sub ? `${main} – ${sub}` : main, month: d[1]!, day: d[2]! }]
  })
}

/** Pages a parser needs besides the list (the detail pages of The Sofia's music shows, Fox & Goose's month post). Few, and only what is ahead. */
export const HTML_FOLLOW: Record<string, (html: string, base: string, now: Date) => string[]> = {
  'sofia-music': (html, base, now) =>
    sofiaMusic(html, base)
      .filter((m) => {
        const d = dateOf(m.month, m.day, now)
        return d !== null && Date.parse(`${d}T12:00:00Z`) <= now.getTime() + (SHOWS_AHEAD_DAYS + 1) * 86400_000
      })
      .map((m) => m.url),
  'foxandgoose-monthly': (html, base) => [...new Set([...html.matchAll(/href="([^"]*\/events\/[a-z]+-events\/)"/g)].map((m) => abs(m[1], base)!))],
}

export function parseShows(src: VenueEvents, body: string, now = new Date(), pages: Record<string, string> = {}): VenueShow[] {
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
      return p(body, src.url, now, pages)
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
export function showBody(venue: string, s: VenueShow, source: string, photoCredit?: string): string {
  const times = [...(s.doorsAt ? [`Doors ${clock(s.doorsAt)}`] : []), `Show ${clock(s.startsAt)}`].join(' · ')
  return [`${s.title} at ${venue}`, times, `From ${venue}'s own calendar: ${source}`, ...(photoCredit ? [`Photo: ${photoCredit}`] : [])].join('\n\n')
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
export interface SyncOptions {
  /** The venue Page's interest labels: what an act of no known type is taken to be. */
  venueInterests?: string[]
  /** A picture for a show, with its credit; null keeps the Page's. Called only for shows with no picture of their own yet. */
  photoFor?: (show: VenueShow, key: string, type: EventType) => Promise<{ url: string; credit: string } | null>
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
export async function syncVenueShows(db: Db, groupId: string, venue: string, source: string, shows: VenueShow[], photoUrl: string | null, now: Date, opts: SyncOptions = {}): Promise<SyncTally> {
  const want = upcoming(shows, now)
  const cancelled = new Set(shows.filter((s) => s.cancelled).map(showKey))
  const have = (await db.query(`select id, event_key, starts_at, body, ticket_url, photo_url from public.page_posts where group_id = $1 and event_key is not null`, [groupId])).rows as { id: string; event_key: string; starts_at: Date; body: string; ticket_url: string | null; photo_url: string | null }[]
  const byKey = new Map(have.map((h) => [h.event_key, h]))
  const tally: SyncTally = { added: 0, updated: 0, removed: 0, kept: 0 }
  const tagged = new Map<string, string[]>()
  for (const s of want) {
    const key = showKey(s)
    const type = classifyEvent(s.title, opts.venueInterests ?? [])
    for (const label of EVENT_INTERESTS[type]) tagged.set(label, [...(tagged.get(label) ?? []), key])
    const old = byKey.get(key)
    byKey.delete(key)
    // A show still wearing the Page's cover (or none) gets a picture that fits it; one that already has its own keeps it and its credit.
    const fresh = opts.photoFor && (!old || !old.photo_url || old.photo_url === photoUrl) ? await opts.photoFor(s, key, type) : null
    const photo = fresh?.url ?? old?.photo_url ?? photoUrl
    const body = showBody(venue, s, source, fresh?.credit ?? (old && old.photo_url !== photoUrl ? /\n\nPhoto: (.+)$/.exec(old.body)?.[1] : undefined))
    if (!old) {
      await db.query(
        `insert into public.page_posts (group_id, body, starts_at, photo_url, lifecycle_state, discoverability, event_key, ticket_url, created_at, updated_at)
         values ($1, $2, $3, $4, 'active', 'listed', $5, $7, $6, $6)
         on conflict (group_id, event_key) where event_key is not null do nothing`,
        [groupId, body, s.startsAt, photo, key, now, s.ticketUrl ?? null],
      )
      tally.added++
    } else if (new Date(old.starts_at).getTime() !== s.startsAt.getTime() || old.body !== body || old.ticket_url !== (s.ticketUrl ?? null) || old.photo_url !== photo) {
      await db.query(`update public.page_posts set starts_at = $2, body = $3, ticket_url = $5, photo_url = $6, updated_at = $4 where id = $1`, [old.id, s.startsAt, body, now, s.ticketUrl ?? null, photo])
      tally.updated++
    } else tally.kept++
  }
  // #1045 — each show carries the interests of its kind, so My interests and the Category filter find it (the Page's own tags never say "a game").
  for (const [label, keys] of tagged) {
    const normalized = label.trim().toLowerCase().replace(/\s+/g, ' ')
    await db.query(`insert into public.tags (label, normalized, created_by) values ($1, $2, $3) on conflict (normalized) do nothing`, [label, normalized, SYSTEM_MEMBER_ID])
    await db.query(
      `insert into public.post_tags (post_id, tag_id)
       select p.id, t.id from public.page_posts p, public.tags t
        where p.group_id = $1 and p.event_key = any($2::text[]) and t.normalized = $3
       on conflict do nothing`,
      [groupId, keys, normalized],
    )
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

/**
 * #1044 — a venue page, read politely. A server error or a dead connection (Golden 1 Center: 504 from the runner, 200 from a laptop)
 * gets three tries, 5 s then 15 s apart; a 4xx or a 429 is the venue's answer and ends it at once.
 */
export async function getWithRetries(url: string, f: (url: string, init: RequestInit) => Promise<Response>, sleep: (ms: number) => Promise<unknown>, waits = [5_000, 15_000]): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    let failure: Error
    try {
      const res = await f(url, { headers: { 'user-agent': IMPORT_UA, accept: 'text/html,application/json,text/calendar,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(30_000) })
      if (res.status === 429) throw new Error('rate limited (429)')
      if (res.ok) return await res.text()
      if (res.status < 500) throw new Error(`HTTP ${res.status}`)
      failure = new Error(`HTTP ${res.status}`)
    } catch (e) {
      if (e instanceof Error && /^(HTTP 4|rate limited)/.test(e.message)) throw e
      failure = e instanceof Error ? e : new Error(String(e))
    }
    if (attempt >= waits.length) throw failure
    await sleep(waits[attempt]!)
  }
}

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

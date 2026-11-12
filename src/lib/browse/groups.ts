// Don (2026-11-01): "pages and posts should be categorized separately … a shelf for upcoming N days. and then
// another shelf for venues (Pages) … categorized differently too for kinds of venues." Typed result rows, as Spotify
// and Yelp group theirs. A group holds Pages or posts, never both. Things happening come first (by when), then Pages
// by kind, then posts by kind. A post sits in at most one time group and one kind group; an empty group is left out.
// Labels are draft copy (human-review).

import type { BrowseResult } from '@/lib/feed/browse-feed'
import { happeningWindows } from '@/lib/metro/happening'
import { METRO_TIME_ZONE, metroWallTimeToInstant } from '@/lib/metro/metro-time'
import { metroDate, shiftDays } from '@/lib/metro/metro-week'
import { classifyEvent, type EventType } from '@/lib/unclaimed/event-type'
import { venueShow } from '@/lib/posts/lead-line'
import { postKindOf } from './filters'
import { COPY } from '@/lib/copy'

export interface ResultGroup {
  key: string
  label: string
  results: BrowseResult[]
  /** F121 — the shelf row this group counts against; set only for Explore's shelves. */
  logId?: string
}

const TIME: [key: string, label: string][] = [
  ['today', 'Today'],
  ['next-7', 'Next 7 days'],
  ['weekend', 'This weekend'],
  ['later', 'Coming up'],
]

const POST_KINDS: [key: string, label: string][] = [
  ['concerts', 'Concerts'],
  ['theater', 'Musicals & theater'],
  ['comedy', 'Comedy'],
  ['open-mics', 'Open mics'],
  ['sports', 'Sports'],
  ['family', 'Family'],
  ['more-events', 'More events'],
  ['sale', 'Sales'],
  ['limited', 'Limited'],
  ['reminder', 'Reminders'],
  ['wonder', 'Count me in'],
  ['hiring', 'Hiring'],
  ['news', 'News'],
  // Signed out, a post is held back behind its Page's card (F093): its kind is not the reader's to see.
  ['withheld', COPY.withheldCta],
]

// Venue kinds after Pollstar's and Bandsintown's venue types (arena, theater, club), which track room size and so
// touring scale, plus Google's "Live music venue" for a bar or pub. Read from the Page's own name and description.
const VENUES: [key: string, label: string, test: RegExp][] = [
  ['arenas', 'Arenas', /\b(arena|stadium|amphitheat(er|re)|pavilion)\b/i],
  ['theaters', 'Theaters & arts centers', /\b(theat(er|re)s?|playhouse|opera house|performing arts|arts? cent(er|re)|cultural cent(er|re)|concert hall|auditorium)\b/i],
  ['comedy', 'Comedy clubs', /\bcomedy club\b|\bimprov\b/i],
  ['bars', 'Bars & pubs with live music', /\b(bars?|pub|tavern|saloon|brewery|taproom|lounge|trading post)\b/i],
  ['clubs', 'Music clubs & venues', /\b(concert (club|venue)|nightclub|music venue|music room|ballroom|venue)\b|\bshows\b/i],
]
const MUSIC = /\b(music|band|bands|concerts?|shows?|gigs?|dj|open mic|jazz|blues)\b/i

const SHOW_GROUP: Record<EventType, string> = {
  music: 'concerts',
  theater: 'theater',
  comedy: 'comedy',
  sports: 'sports',
  family: 'family',
  other: 'more-events',
}

const OPEN_MIC = /\bopen[\s-]?mic\b/i

function nextDays(now: Date, days: number): { from: string; to: string } {
  const end = shiftDays(metroDate(now, METRO_TIME_ZONE), days)
  return { from: now.toISOString(), to: new Date(metroWallTimeToInstant(end, '00:00', METRO_TIME_ZONE)!).toISOString() }
}

function timeGroup(r: BrowseResult, now: Date): string | null {
  if (!r.startsAt) return null
  const start = Date.parse(r.startsAt)
  const end = Date.parse(r.endsAt ?? r.startsAt)
  const w = happeningWindows(now)
  const week = nextDays(now, 7)
  const live = (win: { from: string; to: string }) => start < Date.parse(win.to) && end >= Date.parse(win.from)
  if (live(w.today)) return 'today'
  if (live(w.thisWeekend)) return 'weekend'
  if (live(week)) return 'next-7'
  return start >= Date.parse(week.to) ? 'later' : null
}

function postKindGroup(r: BrowseResult): string {
  if (r.withheld) return 'withheld'
  const kind = postKindOf(r) ?? 'news'
  if (kind !== 'event') return kind
  if (OPEN_MIC.test([r.headline, r.body].filter(Boolean).join(' '))) return 'open-mics'
  const show = venueShow(r)
  const title = r.headline?.trim() || (r.body ?? '').split('\n')[0]!
  return SHOW_GROUP[show?.type ?? classifyEvent(title, r.tags)]
}

/** A venue's kind, or null for a Page that is not a venue. A bar or pub counts only when it has music. */
function venueKind(r: BrowseResult): string | null {
  const text = `${r.name} ${r.description ?? ''}`
  const music = MUSIC.test(text) || r.tags.some((t) => /live music|comedy/i.test(t))
  for (const [key, , test] of VENUES) {
    if (!test.test(text)) continue
    if ((key === 'bars' || key === 'clubs') && !music) return null
    return key
  }
  return null
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function pageGroups(pages: BrowseResult[]): ResultGroup[] {
  const by = new Map<string, ResultGroup>()
  for (const r of pages) {
    const venue = venueKind(r)
    const tag = r.tags[0]?.trim()
    const [key, label] = venue
      ? [`pages:${venue}`, VENUES.find(([k]) => k === venue)![1]]
      : tag
        ? [`pages:tag:${tag.toLowerCase()}`, capital(tag)]
        : ['pages:more', 'More places & groups']
    const g = by.get(key) ?? { key, label, results: [] }
    g.results.push(r)
    by.set(key, g)
  }
  const venueOrder = ['arenas', 'theaters', 'clubs', 'bars', 'comedy'].map((k) => `pages:${k}`)
  const groups = [...by.values()]
  // A tag with one Page folds into the rest: a row of one is noise. Venue kinds always stand.
  const kept = groups.filter((g) => !g.key.startsWith('pages:tag:') || g.results.length > 1)
  const folded = groups.filter((g) => !kept.includes(g) || g.key === 'pages:more').flatMap((g) => g.results)
  const rows = kept.filter((g) => g.key !== 'pages:more')
  rows.sort((a, b) => (venueOrder.indexOf(a.key) + 1 || 99) - (venueOrder.indexOf(b.key) + 1 || 99))
  if (rows.length && folded.length) rows.push({ key: 'pages:more', label: 'More places & groups', results: folded })
  if (rows.length === 0) return [{ key: 'pages', label: 'Places & groups', results: pages }]
  return rows
}

export function groupResults(results: readonly BrowseResult[], now: Date): ResultGroup[] {
  const into = new Map<string, BrowseResult[]>()
  const add = (key: string, r: BrowseResult) => into.set(key, [...(into.get(key) ?? []), r])
  const pages: BrowseResult[] = []
  for (const r of results) {
    if (r.resultKind === 'page') {
      pages.push(r)
      continue
    }
    const when = timeGroup(r, now)
    if (when) add(when, r)
    add(postKindGroup(r), r)
  }
  const ordered = (list: [string, string][]) => list.filter(([k]) => into.has(k)).map(([key, label]) => ({ key, label, results: into.get(key)! }))
  return [...ordered(TIME), ...(pages.length ? pageGroups(pages) : []), ...ordered(POST_KINDS)]
}

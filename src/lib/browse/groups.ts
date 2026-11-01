// Don (2026-11-01): searching "music" should come back sorted: this week, this weekend, venues, concerts vs musicals.
// Typed result rows, as Spotify and Yelp group theirs. A group holds one type, Pages or posts, never both. A post
// sits in at most one time group and one kind group; an empty group is left out. Labels are draft copy (human-review).

import type { BrowseResult } from '@/lib/feed/browse-feed'
import { happeningWindows } from '@/lib/metro/happening'
import { classifyEvent, type EventType } from '@/lib/unclaimed/event-type'
import { venueShow } from '@/lib/posts/lead-line'
import { postKindOf } from './filters'

export interface ResultGroup {
  key: string
  label: string
  results: BrowseResult[]
}

const ORDER: [key: string, label: string][] = [
  ['today', 'Today'],
  ['week', 'This week'],
  ['weekend', 'This weekend'],
  ['later', 'Coming up'],
  ['pages', 'Places & groups'],
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
]

const SHOW_GROUP: Record<EventType, string> = {
  music: 'concerts',
  theater: 'theater',
  comedy: 'comedy',
  sports: 'sports',
  family: 'family',
  other: 'more-events',
}

const OPEN_MIC = /\bopen[\s-]?mic\b/i

function timeGroup(r: BrowseResult, now: Date): string | null {
  if (!r.startsAt) return null
  const start = Date.parse(r.startsAt)
  const end = Date.parse(r.endsAt ?? r.startsAt)
  const w = happeningWindows(now)
  const live = (win: { from: string; to: string }) => start < Date.parse(win.to) && end >= Date.parse(win.from)
  if (live(w.today)) return 'today'
  if (live(w.thisWeekend)) return 'weekend'
  if (live(w.thisWeek)) return 'week'
  return start >= Date.parse(w.thisWeek.to) ? 'later' : null
}

function kindGroup(r: BrowseResult): string {
  const kind = postKindOf(r) ?? 'news'
  if (kind !== 'event') return kind
  const words = [r.headline, r.body].filter(Boolean).join(' ')
  if (OPEN_MIC.test(words)) return 'open-mics'
  const show = venueShow(r)
  const title = r.headline?.trim() || (r.body ?? '').split('\n')[0]!
  return SHOW_GROUP[show?.type ?? classifyEvent(title, r.tags)]
}

export function groupResults(results: readonly BrowseResult[], now: Date): ResultGroup[] {
  const into = new Map<string, BrowseResult[]>()
  const add = (key: string, r: BrowseResult) => into.set(key, [...(into.get(key) ?? []), r])
  for (const r of results) {
    if (r.resultKind === 'page') {
      add('pages', r)
      continue
    }
    const when = timeGroup(r, now)
    if (when) add(when, r)
    add(kindGroup(r), r)
  }
  return ORDER.filter(([key]) => into.has(key)).map(([key, label]) => ({ key, label, results: into.get(key)! }))
}

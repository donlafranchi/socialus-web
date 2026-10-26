// T156 — what still refines a fetched browse page, and what no longer does.
//
// WHAT WENT, AND WHY EACH ONE WENT
//
//   * **Sort.** Ordering is the server's — locality and recency, never payment
//     and never what holds attention (F059 criterion 3). A client control that
//     re-sorted the fetched page would re-order a subset and present it as the
//     order, which is worse than no control.
//
//   * **Distance.** It measured from a locality centroid Browse no longer
//     resolves. The scope is a metro now, and "within 1 mile of the metro
//     centroid" is not a neighbourhood — it is a coordinate. Hood-band ranking
//     inside the metro is explicitly *Not this* in F059.
//
//   * **'Recurring'.** It read `fetchRecurringGatheringIds`, which is
//     Item-grain, and there are no Items. A post carries no recurrence rule.
//
// THE VOCABULARY IS TAGS, NOT CATEGORIES. #53 names twelve fixed terms in
// `src/lib/groups/page-categories.ts`; that file does not exist and its
// constant was retired by T159 (#64, ruled 2026-09-13) — creators make their
// own tags, nothing seeds them. So the options come from the result set, the
// way the Item category options used to, and `normalizeTag` is what stops one
// tag forking into several because two creators typed different casing.
//
// FILTERING PRESERVES SERVER ORDER, and stays client-side with a recorded
// ceiling: at v1 inventory the fetched page *is* the corpus. When a metro's
// Page count approaches the page limit this has to move server-side — at that
// point "the first N" stops meaning "everything" and starts meaning "the N
// highest-ranked", and filtering to a rare tag would search the rows least
// likely to hold it.

import { normalizeTag } from '@/lib/groups/tags'
import type { BrowseResult } from '@/lib/feed/browse-feed'
import { happeningWindows } from '@/lib/metro/happening'
import { METRO_TIME_ZONE, metroWallTimeToInstant } from '@/lib/metro/metro-time'
import { shiftDays } from '@/lib/metro/metro-week'
import { INTEREST_VOCAB } from '@/lib/onboarding/interest-vocab'

// #876 (Don, 2026-10-16, on #796): "Target by type or category or date." Explore mixes everything by
// default; three opt-in groups narrow it, combine with each other and with search, and are pushed into
// the feed read (feedOptsFor). The old Updates view is the posts-only Type.
export type ResultType = 'all' | 'pages' | 'posts'
export type PostKind = 'event' | 'deal' | 'last_minute'
/** 'any' | 'today' | 'weekend' | 'week' | a picked day as YYYY-MM-DD (in the metro). */
export type DateFilter = 'any' | 'today' | 'weekend' | 'week' | string

export const TYPE_OPTIONS = [
  { value: 'all', label: 'Everything' },
  { value: 'pages', label: 'Pages' },
  { value: 'posts', label: 'Posts' },
] as const satisfies readonly { value: ResultType; label: string }[]

export const POST_KIND_OPTIONS = [
  { value: 'event', label: 'Events' },
  { value: 'deal', label: 'Deals' },
  { value: 'last_minute', label: 'Last-minute' },
] as const satisfies readonly { value: PostKind; label: string }[]

export const DATE_OPTIONS = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'weekend', label: 'This weekend' },
  { value: 'week', label: 'This week' },
] as const

export interface BrowseFilters {
  type: ResultType
  postKinds: PostKind[]
  following: boolean
  /** Normalised category tags: the 12 interest tags (#818), or a creator's own. */
  tags: string[]
  /** #892 — "My interests": the reader's own interest tags, resolved where the reader is known, never written out. */
  mine: boolean
  date: DateFilter
}

/** #876 — the Category group: the 12 interest tags (#818), normalised as the feed matches them. */
export const CATEGORY_TAGS: string[] = INTEREST_VOCAB.map((t) => normalizeTag(t.label))

export const DEFAULT_BROWSE_FILTERS: BrowseFilters = { type: 'all', postKinds: [], following: false, tags: [], mine: false, date: 'any' }

type ParamSource = Pick<URLSearchParams, 'get'>

export const isPickedDay = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d)
const DATES = new Set<string>(DATE_OPTIONS.map((d) => d.value))

/**
 * Read the filter state out of an old link. Today the box carries it (?q=); an old link's ?schedule=,
 * ?category= and ?view=updates (the Updates view, now the posts-only Type) are written into the box on
 * the way in. Every value is whitelisted, so a stale link degrades to the default, never to an error.
 */
export function parseBrowseFilters(params: ParamSource): BrowseFilters {
  const schedule = params.get('schedule') ?? ''
  return {
    ...DEFAULT_BROWSE_FILTERS,
    type: params.get('view') === 'updates' ? 'posts' : 'all',
    tags: (params.get('category') ?? '').split(',').map(normalizeTag).filter(Boolean),
    date: DATES.has(schedule) ? schedule : 'any',
  }
}

/** Drives the dot on the filter icon, and whether Explore asks the server for a filtered read. */
export function hasBrowseFilters(f: BrowseFilters): boolean {
  return f.type !== 'all' || f.postKinds.length > 0 || f.following || f.tags.length > 0 || f.mine || f.date !== 'any'
}

/**
 * #892 — the Category tags a selection matches: the picked ones, plus the reader's own interests when
 * "My interests" is on. Null means no Category narrowing; an empty list means "match nothing" (My interests
 * with none chosen). A filter, never a ranking: it only says which rows stay.
 */
export function categoryTags(f: BrowseFilters, myTags: readonly string[] = []): string[] | null {
  if (!f.mine) return f.tags.length > 0 ? [...f.tags] : null
  return [...new Set([...f.tags, ...myTags.map(normalizeTag)])]
}

/**
 * #892 — the part of a selection the server read may narrow by. "My interests" is never sent: it is applied
 * where the list already is (applyBrowseFilters), so it keeps whatever order the list has and only drops rows.
 * With it on, the picked Category tags go with it (they are one any-of set), so they stay client-side too.
 */
export function serverFilters(f: BrowseFilters): BrowseFilters {
  return f.mine ? { ...f, mine: false, tags: [] } : f
}

/** Posts, and nothing narrower: the old Updates view. */
export function isPlainPostsView(f: BrowseFilters): boolean {
  return f.type === 'posts' && f.postKinds.length === 0 && !f.following && f.tags.length === 0 && !f.mine && f.date === 'any'
}

export function toggleTag(f: BrowseFilters, tag: string): BrowseFilters {
  const t = normalizeTag(tag)
  return { ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }
}

export function togglePostKind(f: BrowseFilters, k: PostKind): BrowseFilters {
  return { ...f, postKinds: f.postKinds.includes(k) ? f.postKinds.filter((x) => x !== k) : [...f.postKinds, k] }
}

/** A sample says its own kind; a real post has no kind field, so a dated one is an event (the feed's rule too). */
export function postKindOf(r: Pick<BrowseResult, 'resultKind' | 'sampleKind' | 'startsAt'>): PostKind | null {
  if (r.resultKind !== 'post') return null
  return r.sampleKind ?? (r.startsAt ? 'event' : null)
}

export interface DateRange {
  from: string
  to: string
}

/** The window a Date choice means, in the metro's time; null for any time. */
export function dateWindow(date: DateFilter, now: Date): DateRange | null {
  if (date === 'any') return null
  const w = happeningWindows(now)
  if (date === 'today') return w.today
  if (date === 'weekend') return w.thisWeekend
  if (date === 'week') return w.thisWeek
  if (!isPickedDay(date)) return null
  const midnight = (ymd: string) => new Date(metroWallTimeToInstant(ymd, '00:00', METRO_TIME_ZONE)!).toISOString()
  return { from: midnight(date), to: midnight(shiftDays(date, 1)) }
}

/** #815 — a post is live in a window from its start through its end (no end: the start is the end). */
function liveIn(r: Pick<BrowseResult, 'startsAt' | 'endsAt'>, w: DateRange): boolean {
  if (!r.startsAt) return false
  const start = Date.parse(r.startsAt)
  const end = Date.parse(r.endsAt ?? r.startsAt)
  return start < Date.parse(w.to) && end >= Date.parse(w.from)
}

/** Everything a search looks at: the Page, the post's own words, the tags. */
function haystack(r: BrowseResult): string {
  return [r.name, r.description, r.body, ...r.tags].filter(Boolean).join(' ').toLowerCase()
}

export function searchBrowseResults(results: readonly BrowseResult[], q: string): BrowseResult[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return [...results]
  return results.filter((r) => haystack(r).includes(needle))
}

export function applyBrowseFilters(
  results: readonly BrowseResult[],
  f: BrowseFilters,
  ctx: { now: Date; myTags?: readonly string[] },
): BrowseResult[] {
  const window = dateWindow(f.date, ctx.now)
  const tags = categoryTags(f, ctx.myTags)
  return results.filter((r) => {
    if (f.type === 'pages' && r.resultKind !== 'page') return false
    if (f.type === 'posts' && r.resultKind !== 'post') return false
    if (f.following && !r.followed) return false
    if (f.postKinds.length > 0) {
      const k = postKindOf(r)
      if (!k || !f.postKinds.includes(k)) return false
    }
    if (tags) {
      const own = new Set(r.tags.map(normalizeTag))
      if (!tags.some((t) => own.has(t))) return false
    }
    if (window && !liveIn(r, window)) return false
    return true
  })
}

/** What the filters ask of the feed read, so the server returns the targeted set, not a client cut of 100. */
export function feedOptsFor(f: BrowseFilters, now: Date) {
  const narrowsPosts = f.postKinds.length > 0 || f.date !== 'any'
  const resultKinds: ('page' | 'post')[] | null = f.type === 'pages' ? ['page'] : f.type === 'posts' || narrowsPosts ? ['post'] : null
  const window = f.type === 'pages' ? null : dateWindow(f.date, now)
  return {
    resultKinds,
    postKinds: f.type === 'pages' || f.postKinds.length === 0 ? null : [...f.postKinds],
    tags: f.tags.length > 0 ? [...f.tags] : null,
    startsFrom: window?.from ?? null,
    startsBefore: window?.to ?? null,
    sort: window ? ('soonest' as const) : ('recent' as const),
    following: f.following,
  }
}

/** The tags actually present in what came back — the filter surface's options. */
export function browseTagOptions(results: readonly BrowseResult[]): string[] {
  return Array.from(new Set(results.flatMap((r) => r.tags.map(normalizeTag)).filter(Boolean))).sort()
}

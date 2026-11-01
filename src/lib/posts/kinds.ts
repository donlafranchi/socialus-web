// plan #230 (Don, 2026-10-31) — what a post is, picked first. One home for the kind list, its words, which
// kinds need a date, and how long each stays current (post_current_until in the database is the enforcing copy).

export const POST_KINDS = ['event', 'sale', 'limited', 'reminder', 'news', 'wonder', 'hiring'] as const
export type PostKind = (typeof POST_KINDS)[number]

export const isPostKind = (v: unknown): v is PostKind => typeof v === 'string' && (POST_KINDS as readonly string[]).includes(v)

/** The card's lead-line word, set in small caps by the card. Draft copy (human-review). */
export const POST_KIND_WORD: Record<PostKind, string> = {
  event: 'Event',
  sale: 'Sale',
  limited: 'Limited',
  reminder: 'Reminder',
  news: 'News',
  wonder: 'Proposal',
  hiring: 'Hiring',
}

/** The composer's one-line hint under each kind. Draft copy (human-review). */
export const POST_KIND_HINT: Record<PostKind, string> = {
  event: 'Something happening at a set time.',
  sale: 'A price or an offer, through a date.',
  limited: 'Only a few, while they last.',
  reminder: 'A nudge about something coming up.',
  news: 'An update from your Page.',
  wonder: 'Propose a thing and see who’s in or would help.',
  hiring: 'A job or a role to fill.',
}

/** The page_posts_kind_dated check: these kinds carry a start. */
export const DATED_KINDS: readonly PostKind[] = ['event', 'sale', 'reminder']
export const needsDate = (k: PostKind): boolean => DATED_KINDS.includes(k)

/** Default shelf days for an undated kind; null means it shows until its date passes. */
export const SHELF_DAYS: Record<PostKind, number | null> = {
  event: null,
  reminder: null,
  sale: 7,
  limited: 14,
  news: 7,
  wonder: 14,
  hiring: 30,
}

/** A sale never runs past this many days from posting (post_current_until caps it too). */
export const SALE_MAX_DAYS = 30
export const HEADLINE_MAX = 60

/** A post written without a kind (an older caller): a Wonder stays one, a dated post is an event, the rest news. */
export function inferKind(p: { wonder?: unknown; startsAt?: string | null }): PostKind {
  if (p.wonder) return 'wonder'
  return p.startsAt ? 'event' : 'news'
}

/** The seeder's sample kinds, as post kinds. */
export const SAMPLE_POST_KIND = { event: 'event', deal: 'sale', last_minute: 'limited' } as const satisfies Record<string, PostKind>

/** Why a dated kind was refused without its date. Draft copy (human-review). */
export const DATE_NEEDED: Record<'event' | 'sale' | 'reminder', string> = {
  event: 'An event needs a day and time.',
  sale: 'A sale needs the day it ends.',
  reminder: 'A reminder needs the next day and time.',
}

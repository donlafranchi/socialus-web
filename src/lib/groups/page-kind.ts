// #363 — a Page is a Business, a Group or an Organization (dispatch,
// 2026-10-05). Stored in the existing six-value groups.kind column: no schema
// change, and the SQL that already treats "business" and "everything else"
// differently (managing role, standing presence, items) stays right.

export type PageKind = 'business' | 'group' | 'organization'
export type StoredKind = 'business' | 'interest' | 'event_anchored' | 'place' | 'practice' | 'family'

export const PAGE_KINDS: readonly PageKind[] = ['business', 'group', 'organization']

export const PAGE_KIND_LABEL: Record<PageKind, string> = { business: 'Business', group: 'Group', organization: 'Organization' }

export function pageKindOf(stored: string): PageKind {
  if (stored === 'business') return 'business'
  if (stored === 'event_anchored') return 'organization'
  return 'group'
}

export function storedKindFor(kind: PageKind): StoredKind {
  return kind === 'business' ? 'business' : kind === 'organization' ? 'event_anchored' : 'interest'
}

/** What a Page leads with, and whether it lists products & services. Precedent:
 *  Meetup leads a group with Join and its next event; Google Business Profile
 *  leads a business with Call; Eventbrite leads an organizer with its events. */
export function pageLayoutFor(stored: string): { lead: 'join' | 'contact' | 'events'; productsAndServices: boolean } {
  const kind = pageKindOf(stored)
  if (kind === 'business') return { lead: 'contact', productsAndServices: true }
  if (kind === 'organization') return { lead: 'events', productsAndServices: true }
  return { lead: 'join', productsAndServices: false }
}

/** Dated posts not yet over, soonest first. An undated post is not an event. */
export function upcomingPosts<T extends { startsAt: string | null; endsAt?: string | null }>(posts: T[], now = new Date()): T[] {
  const t = now.getTime()
  return posts
    .filter((p) => p.startsAt && new Date(p.endsAt ?? p.startsAt).getTime() >= t)
    .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime())
}

// #363 — every Page is an organization; its two types are Business and Social
// group, and the use cases are presets under those two (ruled 2026-10-05).
// Stored in the existing six-value groups.kind column, where the preset lives:
// no schema change, and the SQL that already treats "business" and "everything
// else" differently (managing role, standing presence, items) stays right.

export type PageKind = 'business' | 'social'
export type StoredKind = 'business' | 'interest' | 'event_anchored' | 'place' | 'practice' | 'family'

export const PAGE_KINDS: readonly PageKind[] = ['business', 'social']

export const PAGE_KIND_LABEL: Record<PageKind, string> = { business: 'Business', social: 'Social group' }

export function pageKindOf(stored: string): PageKind {
  return stored === 'business' ? 'business' : 'social'
}

/** The stored value for a type: a social Page keeps its preset; a business
 *  turning social starts as an interest group. */
export function storedKindFor(kind: PageKind, current: string): StoredKind {
  if (kind === 'business') return 'business'
  return current === 'business' ? 'interest' : (current as StoredKind)
}

/** "Business · Bakery": the type, then the main collection when there is one. */
export function kindLine(stored: string, collection: string | null | undefined): string {
  const label = PAGE_KIND_LABEL[pageKindOf(stored)]
  return collection?.trim() ? `${label} · ${collection.trim()}` : label
}

/** What a Page leads with, and whether it lists products & services. Precedent:
 *  Meetup leads a group with Join and its next event; Google Business Profile
 *  leads a business with Call; Eventbrite leads an organizer with its events. */
export function pageLayoutFor(stored: string): { lead: 'join' | 'contact' | 'events'; productsAndServices: boolean } {
  if (stored === 'business') return { lead: 'contact', productsAndServices: true }
  if (stored === 'event_anchored') return { lead: 'events', productsAndServices: false }
  return { lead: 'join', productsAndServices: false }
}

/** Dated posts not yet over, soonest first. An undated post is not an event. */
export function upcomingPosts<T extends { startsAt: string | null; endsAt?: string | null }>(posts: T[], now = new Date()): T[] {
  const t = now.getTime()
  return posts
    .filter((p) => p.startsAt && new Date(p.endsAt ?? p.startsAt).getTime() >= t)
    .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime())
}

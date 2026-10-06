// #363 — purpose first, type for listing (Don ruled A, 2026-10-05). Every Page
// has ONE primary purpose: what it mainly accomplishes. Beta's four match
// Create's four answers, each a loop in socialus-plan
// product/needs/member-journey.md. Type (business or social group) follows from
// the purpose by default, can be changed in settings, and is what browsing,
// filters and the Locally owned badge (business only) read. groups.purpose
// holds the purpose, groups.kind the type. Members have no type.

export type PageKind = 'business' | 'group'
export type Purpose = 'gather' | 'sell' | 'offer' | 'create'

export const PAGE_KINDS: readonly PageKind[] = ['business', 'group']
export const PAGE_KIND_LABEL: Record<PageKind, string> = { business: 'Business', group: 'Social group' }

export const PURPOSES: readonly Purpose[] = ['sell', 'gather', 'offer', 'create']

/** Placeholder ([public-is-draft]): the purpose as the owner chooses it. */
export const PURPOSE_LABEL: Record<Purpose, string> = {
  gather: 'Gather',
  sell: 'Sell',
  offer: 'Offer a service or teach',
  create: 'Be creative',
}

/** Placeholder ([public-is-draft]): the second half of the kind line. */
export const PURPOSE_SHORT: Record<Purpose, string> = {
  gather: 'Meets up',
  sell: 'Shop',
  offer: 'Services and classes',
  create: 'Something new',
}

/** The type a purpose implies; the owner can change it. */
export const TYPE_FOR_PURPOSE: Record<Purpose, PageKind> = { sell: 'business', offer: 'business', gather: 'group', create: 'group' }

/** A stored kind from before the two types (place, interest…) reads as group. */
export function pageKindOf(stored: string): PageKind {
  return stored === 'business' ? 'business' : 'group'
}

/** The stored purpose, or the one the type implies when there is none. */
export function purposeOf(stored: string, purpose: string | null | undefined): Purpose {
  return PURPOSES.includes(purpose as Purpose) ? (purpose as Purpose) : pageKindOf(stored) === 'business' ? 'sell' : 'gather'
}

/** "Social group · Meets up", or "Social group · Running" when the Page names its collection.
 *  With the purpose unknown (Explore's feed carries none yet), the type alone. */
export function kindLine(stored: string, purpose: string | null | undefined, collection: string | null | undefined): string {
  const type = PAGE_KIND_LABEL[pageKindOf(stored)]
  const second = collection?.trim() || (purpose === undefined ? null : PURPOSE_SHORT[purposeOf(stored, purpose)])
  return second ? `${type} · ${second}` : type
}

/** What a Page leads with. Precedent: Meetup leads a group with Join and its
 *  next event; Google Business Profile leads a business with Call. */
export function pageLayoutFor(stored: string): { lead: 'join' | 'contact' } {
  return { lead: pageKindOf(stored) === 'business' ? 'contact' : 'join' }
}

/** Dated posts not yet over, soonest first. An undated post is not an event. */
export function upcomingPosts<T extends { startsAt: string | null; endsAt?: string | null }>(posts: T[], now = new Date()): T[] {
  const t = now.getTime()
  return posts
    .filter((p) => p.startsAt && new Date(p.endsAt ?? p.startsAt).getTime() >= t)
    .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime())
}

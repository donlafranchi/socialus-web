// #363 — every Page is an organization; its two types are business and group,
// and the use cases are presets under them (ruled 2026-10-05; socialus-plan
// planning/PAGE-KINDS.md). groups.kind holds the type, groups.use_case the
// preset. The type sets the defaults; any component can be added to any Page.

export type PageKind = 'business' | 'group'
export type UseCase = 'selling' | 'service' | 'gathering' | 'testing_interest'

export const PAGE_KINDS: readonly PageKind[] = ['business', 'group']
export const PAGE_KIND_LABEL: Record<PageKind, string> = { business: 'Business', group: 'Group' }

export const USE_CASES: Record<PageKind, UseCase[]> = {
  business: ['selling', 'service'],
  group: ['gathering', 'testing_interest'],
}
export const ALL_USE_CASES: readonly UseCase[] = [...USE_CASES.business, ...USE_CASES.group]

/** Placeholder ([public-is-draft]): the second half of the kind line. */
export const USE_CASE_LABEL: Record<UseCase, string> = {
  selling: 'Shop',
  service: 'Services',
  gathering: 'Events',
  testing_interest: 'Idea',
}

/** A stored kind from before the two types (place, interest…) reads as group. */
export function pageKindOf(stored: string): PageKind {
  return stored === 'business' ? 'business' : 'group'
}

export function presetOf(stored: string, useCase: string | null | undefined): UseCase {
  const fits = USE_CASES[pageKindOf(stored)]
  return fits.includes(useCase as UseCase) ? (useCase as UseCase) : fits[0]!
}

/** "Group · Events", or "Group · Running" when the Page names its collection.
 *  With the use case unknown (Explore's feed carries none yet), the type alone. */
export function kindLine(stored: string, useCase: string | null | undefined, collection: string | null | undefined): string {
  const type = PAGE_KIND_LABEL[pageKindOf(stored)]
  const second = collection?.trim() || (useCase === undefined ? null : USE_CASE_LABEL[presetOf(stored, useCase)])
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

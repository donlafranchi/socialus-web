// #1183 — posts from a member without a Page (plan #270, Don ruled B). Three fixed kinds, each with its own life
// and its one answer. Words are drafts for Don.

export const MEMBER_POST_KINDS = ['lost_found', 'free_sale', 'ask'] as const
export type MemberPostKind = (typeof MEMBER_POST_KINDS)[number]

export const KIND_LABEL: Record<MemberPostKind, string> = {
  lost_found: 'Lost & found',
  free_sale: 'Free / for sale',
  ask: 'Ask a neighbor',
}

/** How long a post stays up. A yard sale also ends with its day. */
export const KIND_DAYS: Record<MemberPostKind, number> = { lost_found: 7, free_sale: 14, ask: 7 }

/** The one answer, in place of comments. */
export const ANSWER_LABEL: Record<MemberPostKind, string> = {
  lost_found: 'I saw it',
  free_sale: 'I’m interested',
  ask: 'I’m interested',
}

/** Live posts a member may have up at once (Craigslist and Nextdoor both limit by kind). */
export const MAX_LIVE_POSTS = 3

export const isMemberPostKind = (v: unknown): v is MemberPostKind => MEMBER_POST_KINDS.includes(v as MemberPostKind)

export const memberPostHref = (id: string) => `/neighbors/${id}`

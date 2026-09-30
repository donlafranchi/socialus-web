// F093 — the words a stranger sees on a withheld announcement, on Explore and
// on the Page. One module so the two surfaces cannot drift.

import { METRO_WEEK_LABEL } from '@/lib/metro/metro-week'
import { COPY } from '@/lib/copy'

/** Criterion 5: a count named as a period. No nought — "0 this week" beside a
 *  card that exists to say the Page is posting contradicts itself. */
export function withheldCountLabel(count: number): string {
  if (count <= 0) return 'Posted an announcement'
  return `${count} announcement${count === 1 ? '' : 's'} ${METRO_WEEK_LABEL}`
}

export const WITHHELD_DETAILS = 'The details are for members and followers of this Page.'

export const WITHHELD_CTA = COPY.withheldCta

/** `/auth/signup` only redirects here; `next` brings them back to the Page,
 *  where the same announcement now reads in full. */
export function withheldJoinHref(pageHref: string | null): string {
  const page = pageHref?.split('#')[0]
  return page ? `/auth/login?next=${encodeURIComponent(page)}` : '/auth/login'
}

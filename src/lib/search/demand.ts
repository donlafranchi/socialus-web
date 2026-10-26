// #909 — search demand: what a settled Explore search is reduced to before it is counted.
// No member id goes with it; the dedupe key is a one-way hash that lives ten minutes.
import { createHash } from 'node:crypto'
import { stripContactInfo } from '@/lib/text/contact-info'

export const SEARCH_QUERY_MIN = 2
export const SEARCH_QUERY_MAX = 80

/** Lowercased, trimmed, spaces collapsed, contact details stripped, capped at 80; null when nothing worth counting is left. */
export function normalizeSearchQuery(raw: string): string | null {
  let q = stripContactInfo(raw.toLowerCase()).replace(/\s+/g, ' ').trim()
  if (q.length > SEARCH_QUERY_MAX) {
    const cut = q.slice(0, SEARCH_QUERY_MAX + 1)
    const space = cut.lastIndexOf(' ')
    q = (space > SEARCH_QUERY_MIN ? cut.slice(0, space) : cut.slice(0, SEARCH_QUERY_MAX)).trim()
  }
  if (q.length < SEARCH_QUERY_MIN || !/[\p{L}\p{N}]/u.test(q)) return null
  return q
}

/** The dedupe key for one searcher and one query: a hash, so neither is stored in the clear. */
export function demandKey(searcher: string, query: string): string {
  return createHash('sha256').update(`${searcher}\u0000${query}`).digest('hex')
}

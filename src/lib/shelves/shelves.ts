// F121 — shelves are rows of data (public.shelves). This decides which show, in what order, what each asks
// browse_feed for, and what fills it. Rotation, not a bandit (ruled 2026-10-30): the followed shelf and Next 7 days
// stay first; the rest shift one place a day per member, so over n days each shelf spends one day in each slot.

import { createHash } from 'node:crypto'
import { normalizeTag } from '@/lib/groups/tags'
import type { BrowseResult } from '@/lib/feed/browse-feed'
import type { PostKind } from '@/lib/posts/kinds'

export interface ShelfQuery {
  audience?: 'following'
  datedOnly?: boolean
  startsFromDays?: number
  tags?: string[]
  anyOf?: string[]
  postKinds?: PostKind[]
}

export interface ShelfRow {
  id: string
  name: string
  query: ShelfQuery
  leadDays: number | null
  place: 'fixed' | 'rotating'
  fixedOrder: number | null
  seasonStart: string | null
  seasonEnd: string | null
  kind: 'query' | 'followed' | 'interest'
}

/** One shelf on screen. An interest row becomes one per interest; `logId` is the row it counts against. */
export interface Shelf {
  id: string
  logId: string
  title: string
  query: ShelfQuery
  leadDays: number | null
}

export const SHELF_SIZE = 12
const MAX_INTEREST_SHELVES = 3
const DAY = 86_400_000

export const inSeason = (r: Pick<ShelfRow, 'seasonStart' | 'seasonEnd'>, today: string): boolean =>
  !r.seasonStart || !r.seasonEnd || (today >= r.seasonStart && today <= r.seasonEnd)

const hashNumber = (s: string) => createHash('sha256').update(s).digest().readUInt32BE(0)

/** A cyclic shift of `items` by the member's offset plus the day: a Latin square over n days. */
export function rotate<T>(items: readonly T[], member: string, day: number): T[] {
  if (items.length === 0) return []
  const k = (hashNumber(member) + day) % items.length
  return [...items.slice(k), ...items.slice(0, k)]
}

const dayNumber = (today: string) => Math.floor(Date.parse(`${today}T00:00:00Z`) / DAY)

export function arrangeShelves(
  rows: readonly ShelfRow[],
  { today, member, interests }: { today: string; member: string | null; interests: readonly { label: string }[] },
): Shelf[] {
  const live = rows.filter((r) => inSeason(r, today) && (r.kind !== 'followed' || member))
  const plain = (r: ShelfRow): Shelf => ({ id: r.id, logId: r.id, title: r.name, query: r.query, leadDays: r.leadDays })
  const fixed = live
    .filter((r) => r.place === 'fixed')
    .sort((a, b) => (a.fixedOrder ?? 0) - (b.fixedOrder ?? 0))
    .map(plain)
  const rotating = live
    .filter((r) => r.place === 'rotating')
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((r): Shelf[] =>
      r.kind !== 'interest'
        ? [plain(r)]
        : member
          ? interests.slice(0, MAX_INTEREST_SHELVES).map((i) => {
              const tag = normalizeTag(i.label)
              return { id: `${r.id}:${tag}`, logId: r.id, title: r.name.replace('{interest}', tag), query: { ...r.query, tags: [tag] }, leadDays: r.leadDays }
            })
          : [],
    )
  return [...fixed, ...rotate(rotating, member ?? 'anyone', dayNumber(today))]
}

export interface ShelfFeedArgs {
  tags?: string[]
  anyOf?: string[]
  postKinds?: PostKind[]
  startsFrom: string | null
  startsBefore: string | null
}

/** What a shelf asks browse_feed for. A dated-only shelf reads its lead time as the window; the rest filter after. */
export function feedArgs(s: Pick<Shelf, 'query' | 'leadDays'>, now: Date): ShelfFeedArgs {
  const { tags, anyOf, postKinds, datedOnly, startsFromDays } = s.query
  const at = (days: number) => new Date(now.getTime() + days * DAY).toISOString()
  return {
    ...(tags?.length ? { tags } : {}),
    ...(anyOf?.length ? { anyOf } : {}),
    ...(postKinds?.length ? { postKinds } : {}),
    startsFrom: datedOnly ? at(startsFromDays ?? 0) : null,
    startsBefore: datedOnly && s.leadDays ? at(s.leadDays) : null,
  }
}

const keyOf = (r: BrowseResult) => `${r.resultKind}:${r.resultId}`

/** Upcoming only: a dated post once it starts within the lead time (it already left the feed when it ended). */
function qualifies(r: BrowseResult, s: Shelf, now: Date): boolean {
  if (r.resultKind !== 'post') return false
  if (!r.startsAt) return !s.query.datedOnly
  return s.leadDays === null || Date.parse(r.startsAt) <= now.getTime() + s.leadDays * DAY
}

/**
 * Top to bottom: an item goes in the first shelf it qualifies for, a shelf holds SHELF_SIZE, Sample posts are at
 * most one card in four (the 2026-11-01 discovery ruling), and an empty shelf is left out.
 */
export function fillShelves(shelves: readonly Shelf[], reads: readonly (readonly BrowseResult[])[], now: Date): { shelf: Shelf; items: BrowseResult[] }[] {
  const used = new Set<string>()
  const out: { shelf: Shelf; items: BrowseResult[] }[] = []
  shelves.forEach((shelf, i) => {
    const open = (reads[i] ?? []).filter((r) => !used.has(keyOf(r)) && qualifies(r, shelf, now))
    const reals = Math.min(open.filter((r) => !r.sampleKind).length, SHELF_SIZE)
    let samples = Math.min(Math.floor(reals / 3), SHELF_SIZE - reals)
    let realsLeft = reals
    const items: BrowseResult[] = []
    for (const r of open) {
      if (r.sampleKind ? samples-- > 0 : realsLeft-- > 0) items.push(r)
    }
    if (items.length === 0) return
    items.forEach((r) => used.add(keyOf(r)))
    out.push({ shelf, items })
  })
  return out
}

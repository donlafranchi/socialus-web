// #619 / #621 (F092.2, F092.4) — what the search box says about the filter sheet, and back.
//
// The sheet writes its selection into the box as plain lowercase words, the way Google writes one
// (the PM, 2026-10-11: no hashtags), and the box's reader understands every string the sheet can
// write. It is ONE grammar, read in both directions:
//
//     <free words> <tags, as plain words> <this week | this weekend> <updates>
//
// The reader does not parse prose. It takes the words it knows (the schedule phrases, and the tags
// present in the results) out of the box and leaves everything else as the free search, so a word it
// does not know is never an error and never empties the box. It is built to grow: natural-language
// search later adds phrases here, and the free words keep working underneath.

import { normalizeTag } from '@/lib/groups/tags'
import { SCHEDULE_OPTIONS, type BrowseFilters, type ScheduleFilter } from './filters'

const PHRASE: Record<Exclude<ScheduleFilter, 'any'>, string> = {
  week: SCHEDULE_OPTIONS.find((o) => o.value === 'week')!.label.toLowerCase(),
  weekend: SCHEDULE_OPTIONS.find((o) => o.value === 'weekend')!.label.toLowerCase(),
}

/** #796 — the Updates filter's word. */
export const UPDATES_WORD = 'updates'

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean)

/** The box text for a selection: the free words, then the tags, then the schedule, all plain words. */
export function writeBox(filters: BrowseFilters, rest = ''): string {
  return [...words(rest), ...filters.tags.map(normalizeTag), ...(filters.schedule === 'any' ? [] : [PHRASE[filters.schedule]]), ...(filters.updates ? [UPDATES_WORD] : [])]
    .join(' ')
    .trim()
}

/** The schedule phrases are the box's own words: a tag with exactly that text cannot be written as a tag. */
export const isReservedWord = (tag: string): boolean => [...Object.values(PHRASE), UPDATES_WORD].includes(normalizeTag(tag))

interface Token {
  raw: string
  norm: string
  /** Where it stood in the box, so the tags come back in the order they were written. */
  at: number
}

/** Removes the first whole-word occurrence of `phrase` from `tokens`, or reports that there is none. */
function take(tokens: Token[], phrase: string): { left: Token[]; at: number } | null {
  const want = words(phrase)
  if (want.length === 0) return null
  for (let i = 0; i + want.length <= tokens.length; i++) {
    if (want.every((w, j) => tokens[i + j]!.norm === w)) return { left: [...tokens.slice(0, i), ...tokens.slice(i + want.length)], at: tokens[i]!.at }
  }
  return null
}

/**
 * What the box says: the selection it holds and the words left over as the free search. Case and
 * spacing do not matter; a leading # (an old link) is read as the plain word.
 */
export function readBox(text: string, knownTags: readonly string[]): { filters: BrowseFilters; rest: string } {
  let tokens: Token[] = words(text).map((raw, at) => ({ raw, norm: raw.replace(/^#/, '').toLowerCase(), at }))

  // Longest tags first, so "live music" is not read as "live" plus a stray word.
  const found: { tag: string; at: number }[] = []
  const byLength = [...new Set(knownTags.map(normalizeTag).filter((t) => t && !isReservedWord(t)))].sort((a, b) => words(b).length - words(a).length || b.length - a.length)
  for (const tag of byLength) {
    const hit = take(tokens, tag)
    if (hit) {
      tokens = hit.left
      found.push({ tag, at: hit.at })
    }
  }
  const tags = found.sort((a, b) => a.at - b.at).map((f) => f.tag)

  let schedule: ScheduleFilter = 'any'
  for (const kind of ['weekend', 'week'] as const) {
    const hit = schedule === 'any' ? take(tokens, PHRASE[kind]) : null
    if (hit) {
      tokens = hit.left
      schedule = kind
    }
  }

  const updates = take(tokens, UPDATES_WORD)
  if (updates) tokens = updates.left

  return { filters: { schedule, tags, ...(updates ? { updates: true } : {}) }, rest: tokens.map((t) => t.raw).join(' ') }
}

// F092: the box is the state. The filter sheet writes plain words into the search box and readBox takes
// them back out, so there is one text and no second filter state. #876 (Don, 2026-10-16): the words now
// cover the three groups: Type (pages / posts, the post kinds, following), Category (tags) and Date.
import { normalizeTag } from '@/lib/groups/tags'
import { DEFAULT_BROWSE_FILTERS, isPickedDay, type BrowseFilters, type DateFilter, type PostKind, type ResultType } from './filters'

const TYPE_WORD: Record<Exclude<ResultType, 'all'>, string> = { pages: 'pages', posts: 'posts' }
const KIND_WORD: Record<PostKind, string> = { event: 'events', deal: 'deals', last_minute: 'last-minute' }
export const FOLLOWING_WORD = 'following'
/** #892 — the words, not the tags: a shared link carries no one's interests, and each reader's own apply. */
export const MY_INTERESTS_WORDS = 'my interests'
const DATE_PHRASE: Record<'today' | 'weekend' | 'week', string> = { today: 'today', weekend: 'this weekend', week: 'this week' }
/** #796 — the old Updates view's word, read as the posts-only Type and never written again. */
const LEGACY_UPDATES = 'updates'

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean)

/** The box text for a selection: the free words, then the tags, then the groups, all plain words. */
export function writeBox(f: BrowseFilters, rest = ''): string {
  return [
    ...words(rest),
    ...f.tags.map(normalizeTag),
    ...(f.mine ? [MY_INTERESTS_WORDS] : []),
    ...(f.type === 'all' ? [] : [TYPE_WORD[f.type]]),
    ...f.postKinds.map((k) => KIND_WORD[k]),
    ...(f.following ? [FOLLOWING_WORD] : []),
    ...(f.date === 'any' ? [] : [isPickedDay(f.date) ? f.date : DATE_PHRASE[f.date as keyof typeof DATE_PHRASE]]),
  ]
    .join(' ')
    .trim()
}

const RESERVED = [...Object.values(TYPE_WORD), ...Object.values(KIND_WORD), FOLLOWING_WORD, MY_INTERESTS_WORDS, ...Object.values(DATE_PHRASE), LEGACY_UPDATES]

/** The group words are the box's own: a tag with exactly that text cannot be written as a tag. */
export const isReservedWord = (tag: string): boolean => RESERVED.includes(normalizeTag(tag))

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
  const pull = (phrase: string) => {
    const hit = take(tokens, phrase)
    if (hit) tokens = hit.left
    return hit
  }

  const mine = Boolean(pull(MY_INTERESTS_WORDS))
  const found: { tag: string; at: number }[] = []
  const byLength = [...new Set(knownTags.map(normalizeTag).filter((t) => t && !isReservedWord(t)))].sort((a, b) => words(b).length - words(a).length || b.length - a.length)
  for (const tag of byLength) {
    const hit = pull(tag)
    if (hit) found.push({ tag, at: hit.at })
  }

  let type: ResultType = 'all'
  for (const t of ['pages', 'posts'] as const) if (type === 'all' && pull(TYPE_WORD[t])) type = t
  if (type === 'all' && pull(LEGACY_UPDATES)) type = 'posts'
  const postKinds = (Object.keys(KIND_WORD) as PostKind[]).filter((k) => pull(KIND_WORD[k]))
  const following = Boolean(pull(FOLLOWING_WORD))

  let date: DateFilter = 'any'
  // "this weekend" before "this week", so the longer phrase wins.
  for (const d of ['weekend', 'week', 'today'] as const) if (date === 'any' && pull(DATE_PHRASE[d])) date = d
  if (date === 'any') {
    const day = tokens.find((t) => isPickedDay(t.norm))
    if (day) {
      date = day.norm
      tokens = tokens.filter((t) => t !== day)
    }
  }

  return {
    filters: { ...DEFAULT_BROWSE_FILTERS, type, postKinds, following, mine, tags: found.sort((a, b) => a.at - b.at).map((f) => f.tag), date },
    rest: tokens.map((t) => t.raw).join(' '),
  }
}

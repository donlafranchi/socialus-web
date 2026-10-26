// #916 — the search box's words, as the tsquery Explore's server search reads (`to_tsquery('english', …)`).
// Words are reduced to letters and digits before any operator is added, so nothing a member types can act
// as tsquery syntax. Each word is required (&); a word with synonyms widens to an OR of them.
import { SYNONYM_GROUPS } from './synonyms'

const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)

const phrase = (term: string) => {
  const w = words(term)
  return w.length > 1 ? `(${w.join(' <-> ')})` : w[0]!
}

const groupFor = (term: string) => SYNONYM_GROUPS.find((g) => g.includes(term))

export function searchTsQuery(text: string): string | null {
  const w = words(text)
  const parts: string[] = []
  for (let i = 0; i < w.length; i++) {
    const two = i + 1 < w.length ? `${w[i]} ${w[i + 1]}` : null
    const term = two && groupFor(two) ? two : w[i]!
    if (term === two) i++
    const group = groupFor(term)
    parts.push(group ? `(${[term, ...group.filter((g) => g !== term)].map(phrase).join(' | ')})` : phrase(term))
  }
  return parts.length ? parts.join(' & ') : null
}

/** The words as typed, lowercased: what the typo fallback (pg_trgm) compares against names and tags. */
export function searchRaw(text: string): string | null {
  const t = words(text).join(' ')
  return t || null
}

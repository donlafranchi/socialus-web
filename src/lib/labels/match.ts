// #1180 — "Listed under": a word match against the shared list, then the Page's labels, then the fallback.
// What a poster picks under Change is pinned and never re-matched (plan #273 B).

import { normalizeTag } from '@/lib/groups/tags'
import { FALLBACK_LABEL, LABELS, MAX_PICKS } from './list'

const TOP_OF = new Map<string, string>()
const LABEL_OF = new Map<string, string>()
for (const t of LABELS) {
  TOP_OF.set(normalizeTag(t.label), t.label)
  LABEL_OF.set(normalizeTag(t.label), t.label)
  for (const f of t.finer) {
    TOP_OF.set(normalizeTag(f.label), t.label)
    LABEL_OF.set(normalizeTag(f.label), f.label)
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pattern = (word: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${escape(normalizeTag(word)).replace(/ /g, '\\s+')}(s|es)?(?=$|[^\\p{L}\\p{N}])`, 'u')
const compiled = new Map<string, RegExp>()
/** Each word found counts once per word in it, so "repair cafe" outweighs "cafe". */
const hits = (text: string, words: readonly string[]) =>
  words.reduce((n, w) => {
    let re = compiled.get(w)
    if (!re) compiled.set(w, (re = pattern(w)))
    return re.test(text) ? n + normalizeTag(w).split(' ').length : n
  }, 0)

export const isListLabel = (label: string) => LABEL_OF.has(normalizeTag(label))
/** The list's own spelling of a label, or null. */
export const listLabel = (label: string) => LABEL_OF.get(normalizeTag(label)) ?? null
/** The top label a label sits under (a top label is its own). */
export const topOf = (label: string) => TOP_OF.get(normalizeTag(label)) ?? null

/** The best top label and up to two of its finer ones, by how many of their words the text holds; a tie goes to
 *  the more specific, then to list order. */
export function suggestLabels(text: string): string[] {
  const t = text.toLowerCase().replace(/[’‘]/g, "'")
  let best: { label: string; score: number; specific: number; finer: { label: string; score: number }[] } | null = null
  for (const top of LABELS) {
    const finer = top.finer.map((f) => ({ label: f.label, score: hits(t, f.words) })).filter((f) => f.score > 0)
    const score = hits(t, top.words) + finer.reduce((n, f) => n + f.score, 0)
    const specific = finer.reduce((n, f) => n + f.score, 0)
    // A tie goes to the one with more finer hits: "pottery" says more than "food".
    if (score > 0 && (!best || score > best.score || (score === best.score && specific > best.specific))) best = { label: top.label, score, specific, finer }
  }
  if (!best) return []
  const finer = [...best.finer].sort((a, b) => b.score - a.score).slice(0, MAX_PICKS - 1)
  return [best.label, ...finer.map((f) => f.label)]
}

/** What "Listed under" shows before the poster picks: the words, else the Page's labels, else the fallback. */
export function listedUnder({ text, pageTags = [] }: { text: string; pageTags?: readonly string[] }): string[] {
  const words = suggestLabels(text)
  if (words.length > 0) return words
  const page = picksFromTags(pageTags)
  return page.length > 0 ? page : [FALLBACK_LABEL]
}

/** Stored tags: list labels only, each finer one preceded by its top label, no duplicates. */
export function toStoredTags(picks: readonly string[]): string[] {
  const out: string[] = []
  for (const p of picks) {
    const label = listLabel(p)
    if (!label) continue
    const top = topOf(label)!
    if (!out.includes(top)) out.push(top)
    if (!out.includes(label)) out.push(label)
  }
  return out
}

/** A row's tags read back as list labels, in the list's spelling. Anything else is dropped. */
export function picksFromTags(tags: readonly string[]): string[] {
  return toStoredTags(tags)
}

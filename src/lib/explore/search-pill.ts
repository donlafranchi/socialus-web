// Don, 2026-11-01 — the Airbnb-style pill: what it reads idle, and how the panel's What and When
// write the box. The box stays the one state (F092); these only read it and rewrite it.
import { readBox, writeBox } from '@/lib/browse/box-text'
import { DATE_OPTIONS, POST_KIND_OPTIONS, isPickedDay, type DateFilter, type PostKind } from '@/lib/browse/filters'

export interface PillSummary {
  what: string
  where: string
  when: string
}

export const WHEN_LABEL = (d: DateFilter): string =>
  isPickedDay(d)
    ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : (DATE_OPTIONS.find((o) => o.value === d)?.label ?? 'Any time')

const KIND_LABEL = (k: PostKind) => POST_KIND_OPTIONS.find((o) => o.value === k)!.label

export function pillSummary(box: string, knownTags: readonly string[], area: string | null): PillSummary {
  const { filters, rest } = readBox(box, knownTags)
  const named = [...filters.tags, ...filters.postKinds.map(KIND_LABEL)]
  return {
    what: rest.trim() || named.join(', ') || 'Anything',
    where: area ?? 'Anywhere nearby',
    when: WHEN_LABEL(filters.date),
  }
}

export function toggleKind(box: string, knownTags: readonly string[], kind: PostKind): string {
  const { filters, rest } = readBox(box, knownTags)
  const postKinds = filters.postKinds.includes(kind) ? filters.postKinds.filter((k) => k !== kind) : [...filters.postKinds, kind]
  return writeBox({ ...filters, postKinds }, rest)
}

export function withWhen(box: string, knownTags: readonly string[], date: DateFilter): string {
  const { filters, rest } = readBox(box, knownTags)
  return writeBox({ ...filters, date }, rest)
}

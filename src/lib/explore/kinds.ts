// T114 — kind-filter vocabulary for the Explore pill row (F045).
//
// Schema terms in code, UI labels per CLAUDE.md § Naming conventions:
// gathering→Events, wonder→Ideas. `null` is the unfiltered "All" selection.

export const KIND_FILTERS = [
  { value: null, label: 'All' },
  { value: 'gathering', label: 'Events' },
  { value: 'product', label: 'Products' },
  { value: 'service', label: 'Services' },
  { value: 'wonder', label: 'Ideas' },
  { value: 'offer', label: 'Offers' },
  { value: 'ask', label: 'Asks' },
] as const

export type ItemKindFilter = (typeof KIND_FILTERS)[number]['value']

const VALID = new Set(KIND_FILTERS.map((k) => k.value).filter(Boolean) as string[])

/** Read `?kind=` — anything not a known schema kind falls back to All. */
export function parseKindParam(raw: string | null | undefined): ItemKindFilter {
  return raw && VALID.has(raw) ? (raw as ItemKindFilter) : null
}

/** Stable DOM id per pill, shared by the tab and the results tabpanel. */
export function kindTabId(kind: ItemKindFilter): string {
  return `kind-tab-${kind ?? 'all'}`
}

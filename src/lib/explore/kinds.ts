// T114 — kind-filter vocabulary for the Explore pill row (F045).
// T119 — the pill row is derived from BROWSABLE_KINDS rather than listed by
// hand. Withholding a kind from browse surfaces (F054) has to withdraw its
// filter pill in the same edit: a pill for a kind the index no longer returns
// is a control that always yields the empty state, which reads as a broken
// filter rather than as an unbuilt feature.
//
// Schema terms in code, UI labels per CLAUDE.md § Naming conventions:
// gathering→Events.

import { BROWSABLE_KINDS } from '@/lib/feed/item-url'

/** Display order and label per kind. Only browsable kinds become pills. */
const KIND_PILL_LABELS: Record<string, string> = {
  gathering: 'Events',
  product: 'Products',
  service: 'Services',
  wonder: 'Ideas',
  offer: 'Offers',
  ask: 'Asks',
  initiative: 'Initiatives',
}

/** Scenario order (F045): Events, Products, Services, then the rest. */
const PILL_ORDER = ['gathering', 'product', 'service', 'wonder', 'offer', 'ask', 'initiative']

export const KIND_FILTERS: readonly { value: string | null; label: string }[] = [
  { value: null, label: 'All' },
  ...PILL_ORDER.filter((k) => (BROWSABLE_KINDS as readonly string[]).includes(k)).map((k) => ({
    value: k,
    label: KIND_PILL_LABELS[k],
  })),
]

export type ItemKindFilter = string | null

const VALID = new Set(KIND_FILTERS.map((k) => k.value).filter(Boolean) as string[])

/** Read `?kind=` — anything not a currently-browsable kind falls back to All. */
export function parseKindParam(raw: string | null | undefined): ItemKindFilter {
  return raw && VALID.has(raw) ? raw : null
}

/** Stable DOM id per pill, shared by the tab and the results tabpanel. */
export function kindTabId(kind: ItemKindFilter): string {
  return `kind-tab-${kind ?? 'all'}`
}

// T144 — the Page category vocabulary.
// Spec: product/systems/groups.md § One category, from a fixed list.
//
// A named TypeScript constant, not a database enum or CHECK constraint —
// review binding note 2: the twelve terms will grow to thirteen and
// beyond, and encoding them in the schema would make every vocabulary
// change a migration. `groups.category` is plain text; this constant is
// the only place that enforces the closed set, at the handler.

export const PAGE_CATEGORIES = [
  'Food & Drink',
  'Growing',
  'Home & Body',
  'Textiles & Craft',
  'Wood, Metal & Repair',
  'Art & Music',
  'Classes & Workshops',
  'Sport & Outdoors',
  'Community & Mutual Aid',
  'Music & Nightlife',
  'Family & Kids',
  'Faith & Culture',
] as const

export type PageCategory = (typeof PAGE_CATEGORIES)[number]

export function isPageCategory(value: string): value is PageCategory {
  return (PAGE_CATEGORIES as readonly string[]).includes(value)
}

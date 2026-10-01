// T159 (#64) — the tag vocabulary.
//
// Ruled 2026-09-13: tags are the only vocabulary, and creators create their
// own. Nothing seeds them — the first creator who types `sourdough` is the
// reason that tag exists.
//
// Replaces PAGE_CATEGORIES, which offered twelve fixed terms. The reasoning
// for the change, kept because it is the part worth remembering: Amazon and
// Yelp both look like they have categories and do not. Fine-grained labels
// chosen by the creator, with search as the front door.

/** Long enough for "community supported agriculture", short enough to render. */
export const TAG_MAX_LENGTH = 40

/** A Page's tags, at publish and on every edit after. */
export const MAX_TAGS_PER_PAGE = 12

/**
 * The uniqueness key for a tag.
 *
 * Creators type freely, so casing and spacing would otherwise fork one tag
 * into several — and the failure is silent: search still works, it just finds
 * a fraction of what it should. Punctuation is deliberately kept: stripping it
 * would turn "farmer's market" and "farmers market" into one tag, which is
 * arguably right, but would also mangle "wood-fired" into "woodfired" and
 * merge genuinely distinct trade names.
 */
export function normalizeTag(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** A label is usable if it survives normalization and fits. */
export function isValidTagLabel(label: string): boolean {
  const n = normalizeTag(label)
  return n.length > 0 && n.length <= TAG_MAX_LENGTH
}

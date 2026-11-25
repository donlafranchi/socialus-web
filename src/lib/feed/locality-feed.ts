// The feed card's shape and the tag and page-size rules browse and venue pages share. The locality feed's own
// reads left with the old home feed (#1302, #1363).

export interface FeedItem {
  itemId: string
  kind: string
  title: string
  category: string | null
  brandLabel: string | null
  groupId: string | null
  /** Only an item posted without a Page names its poster; null for a Page's items (#246). */
  ownerHandle: string | null
  nearestLocationLabel: string | null
  responseCount: number
  primaryTag: string | null
  /** Hero image for the feed card. items.photo_url, else item_products.photo_urls[1]. */
  photoUrl: string | null
  publishedAt: string
  /** T119 — canonical-URL prefix for a Group-filed Item; null when unfiled or
   *  when the Group has no resolvable Place. Attached by attachGroupPrefixes. */
  groupSlug?: string | null
  groupPlacePath?: string | null
}

const TAG_RE = /^[a-z0-9-]{1,60}$/

/** Lowercase, dedupe, drop invalid tags. Empty result → null (no tag filter). */
export function normalizeTags(tags: readonly string[] | null | undefined): string[] | null {
  if (!tags) return null
  const clean = Array.from(
    new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => TAG_RE.test(t))),
  )
  return clean.length > 0 ? clean : null
}

/** Clamp the feed page size to 1..100, default 50. */
export function clampLimit(n: number | null | undefined): number {
  if (n == null || Number.isNaN(n)) return 50
  return Math.max(1, Math.min(100, Math.floor(n)))
}

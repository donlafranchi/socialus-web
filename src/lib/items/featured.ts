// #909 — a Page's featured products and services (Don, 2026-10-18).

/** The most a Page features. A short shelf, not a catalogue: model.md has no catalogue of listings. */
export const FEATURED_ITEMS_MAX = 12

export type FeaturedKind = 'product' | 'service'

export interface FeaturedItem {
  id: string
  kind: FeaturedKind
  name: string
  details: string
  priceCents: number | null
  inStock: boolean
  photoUrl: string | null
  /** Set on a sample the unclaimed-Pages loader took from the business's own website. */
  sampleSourceUrl: string | null
  /** A report hid it; only the member who added it gets it back from the database. */
  hidden: boolean
}

/** "$4.50", "$40". No price shows nothing. */
export function formatPrice(cents: number | null): string | null {
  if (cents == null) return null
  const dollars = cents / 100
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`
}

/** "$4.50" or "4.5" or "4" → cents; blank → null; anything else → undefined (refuse). */
export function parsePrice(text: string): number | null | undefined {
  const t = text.trim().replace(/^\$/, '').replace(/,/g, '')
  if (t === '') return null
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return undefined
  return Math.round(Number(t) * 100)
}

/** The credit line's site name: "fieldandfarm.com". */
export function sourceHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

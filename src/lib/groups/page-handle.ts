// A Page's canonical address — a cosmetic slug plus a short non-sequential ID.
//
// Ruled by Don, 2026-09-21 (ops-pattern planning/URL-IDENTITY.md; Issue #175).
// Two constraints in his own words: "addresses/locations will evolve … right
// now we're using metros but one day may use neighborhoods", and "I'm
// concerned about a URL being downstream of a member." So: no geography in the
// address, and nothing in it derived from who made the Page.
//
// THE ID RESOLVES; THE SLUG DOES NOT. `joes-pizza-7k3x8m` and
// `whatever-they-called-it-7k3x8m` are the same Page, and only the first is
// canonical. That is what lets a slug change without breaking a link somebody
// already sent, and it is why there is no slug-history table here: an old slug
// was never identity, so there is nothing to remember.
//
// Crockford base32 on the ID: digits and letters minus i, l, o and u. That
// kills 0/O and 1/l/I for anyone reading an address aloud, and dropping u
// blocks most accidental words. Case-insensitive on read, lower-case on write.

/** Crockford base32, lower-case. Also the generator's alphabet in SQL —
 *  `public.new_page_public_id()` carries the same 32 characters in the same
 *  order, and a test compares them. */
export const PUBLIC_ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/** Six, not four. Four is 32⁴ ≈ 1.05M values and a birthday collision becomes
 *  likely around 1,200 Pages — one metro reaches that. Six is ≈ 1.07B. */
export const PUBLIC_ID_LENGTH = 6

const ID_CHARS = new Set(PUBLIC_ID_ALPHABET)

/** The id address, /g/<id>: what resolves inside, and the fallback for a Page with no readable address yet (a
 *  draft). #1139 (Don, 2026-11-01) replaced it as the shared address; the proxy forwards it to `pagePath`. */
export function canonicalPagePath(publicId: string): string {
  return `/g/${publicId}`
}

export interface PageAddressParts {
  publicId: string
  placeUrlSlug?: string | null
  pageUrlSlug?: string | null
  /** #625 — a report hid the Page's words; the slug is made of them, so it is shared by its id until they are back. */
  wordsHidden?: boolean
}

/** #1139 (Don, 2026-11-01) — a Page's address: /<place>-<st>/<page-slug>, e.g. /sacramento-ca/plant-foundry, frozen
 *  at first publish. The id address only while the Page has none. */
export function pagePath(p: PageAddressParts): string {
  return p.placeUrlSlug && p.pageUrlSlug && !p.wordsHidden ? `/${p.placeUrlSlug}/${p.pageUrlSlug}` : canonicalPagePath(p.publicId)
}

/** A place segment: a slug with its state on the end (sacramento-ca, lakeside-san-diego-ca). */
export const isPlaceSegment = (s: string): boolean => s.length <= 100 && /^[a-z0-9]+(-[a-z0-9]+)*-[a-z]{2}$/.test(s)

/** A Page or post slug as the database mints it. */
export const isSlugSegment = (s: string): boolean => s.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)

/** Whether a route segment is a Page id exactly as minted: lower case, the
 *  right length, every character from the alphabet. Anything else is no Page. */
export function isPageId(segment: string): boolean {
  if (segment.length !== PUBLIC_ID_LENGTH) return false
  for (const ch of segment) if (!ID_CHARS.has(ch)) return false
  return true
}

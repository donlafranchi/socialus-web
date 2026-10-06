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

/** The only Page address: /g/<id> (#411; the PM, 2026-10-06). One segment,
 *  no geography, no name, so a rename cannot move it. Older forms are not
 *  forwarded while there are no members to protect; they are not found. */
export function canonicalPagePath(publicId: string): string {
  return `/g/${publicId}`
}

/** Whether a route segment is a Page id exactly as minted: lower case, the
 *  right length, every character from the alphabet. Anything else is no Page. */
export function isPageId(segment: string): boolean {
  if (segment.length !== PUBLIC_ID_LENGTH) return false
  for (const ch of segment) if (!ID_CHARS.has(ch)) return false
  return true
}

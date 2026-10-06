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

/** Crockford's decoding rules: the look-alikes fold onto the character they
 *  look like, rather than being rejected. Someone reading an address off a
 *  poster types what they see and still arrives. */
function foldCrockford(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[il]/g, '1')
    .replace(/o/g, '0')
}

/** The canonical handle for a Page: its id alone (#411; the PM, 2026-10-06).
 *  A rename cannot move it, so no shared link breaks. */
export function pageHandle(publicId: string): string {
  return publicId
}

/** The canonical path. One segment, no geography, no name — a place path or a
 *  name-and-id form is an older address that forwards here. */
export function canonicalPagePath(publicId: string): string {
  return `/g/${pageHandle(publicId)}`
}

export interface ParsedPageHandle {
  /** The ID, folded and lower-cased — what to look the Page up by. */
  publicId: string
  /** Everything before it. Display only; never used to resolve. */
  slug: string
}

/**
 * Split a handle into the part that resolves and the part that does not.
 *
 * Returns null when there is no trailing ID, which is what tells a route this
 * is not an address it can serve. A bare slug is deliberately NOT accepted:
 * serving one would make the slug identity again, which is the whole thing the
 * scheme removes.
 */
export function parsePageHandle(handle: string): ParsedPageHandle | null {
  const trimmed = handle.trim()
  if (!trimmed) return null
  const cut = trimmed.lastIndexOf('-')
  // `-abc123` is no shape this or any older version produced.
  if (cut === 0) return null

  const tail = foldCrockford(trimmed.slice(cut + 1))
  if (tail.length !== PUBLIC_ID_LENGTH) return null
  for (const ch of tail) if (!ID_CHARS.has(ch)) return null

  return { publicId: tail, slug: cut < 0 ? '' : trimmed.slice(0, cut).toLowerCase() }
}

/**
 * Whether the handle a reader arrived on is already the canonical one.
 *
 * False means redirect — permanently, and to the canonical form, never serving
 * a second copy of the Page at the address they used. That rule is what keeps
 * an index path (and a stale slug) a pointer rather than an alternative home.
 */
export function isCanonicalHandle(handle: string, publicId: string): boolean {
  return handle === pageHandle(publicId)
}

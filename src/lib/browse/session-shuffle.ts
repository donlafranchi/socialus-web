// #557 — a per-session seeded shuffle, so each sign-in leads with different businesses.
// Order = recency band first (a post from today is never buried under a stale one),
// then a hash of (seed, id) inside the band. Hash keys, not a positional shuffle, so
// the order is stable across refetches, pagination and rows appearing or vanishing.

export const SEED_COOKIE = 'su_seed'

/** Upper age bound of each band, newest first; anything older is the last band. */
export const DEFAULT_BAND_MS = [2, 7, 30].map((d) => d * 24 * 60 * 60 * 1000)

/** 53-bit string hash (cyrb53) mapped to [0,1). */
function hash01(input: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return ((h2 >>> 0) * 0x200000 + (h1 >>> 21)) / 2 ** 53
}

export interface SessionShuffleOptions<T> {
  id: (item: T) => string
  /** ISO timestamp the band is judged on (the row's sortAt). */
  at: (item: T) => string
  now: Date
  bandMs?: number[]
}

/** Same seed and rows give the same order; a different seed gives a different one. Nothing dropped or duplicated. */
export function sessionShuffle<T>(items: T[], seed: string | null, opts: SessionShuffleOptions<T>): T[] {
  if (!seed || items.length < 2) return items
  const bounds = opts.bandMs ?? DEFAULT_BAND_MS
  const keyed = items.map((item, index) => {
    const t = Date.parse(opts.at(item))
    const age = Number.isNaN(t) ? Infinity : opts.now.getTime() - t
    let band = bounds.findIndex((b) => age <= b)
    if (band < 0) band = bounds.length
    return { item, index, band, key: hash01(`${seed}:${opts.id(item)}`) }
  })
  keyed.sort((a, b) => a.band - b.band || a.key - b.key || a.index - b.index)
  return keyed.map((k) => k.item)
}

/** A fresh opaque seed. No personal data; it only has to differ between sessions. */
export function newSeed(random: () => number = Math.random): string {
  return Array.from({ length: 4 }, () => Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0')).join('')
}

/** The cookie value is `<m|a>.<seed>`: m = signed in, a = signed out. A change of state mints a new seed. */
export function resolveSeedCookie(
  current: string | undefined,
  signedIn: boolean,
  random?: () => number,
): { value: string; minted: boolean } {
  const flag = signedIn ? 'm' : 'a'
  const m = /^([ma])\.([0-9a-z]{16})$/.exec(current ?? '')
  if (m && m[1] === flag) return { value: m[0], minted: false }
  return { value: `${flag}.${newSeed(random)}`, minted: true }
}

/** The seed inside a cookie value, or null when the cookie is absent or malformed. */
export function seedFromCookie(value: string | undefined | null): string | null {
  const m = /^[ma]\.([0-9a-z]{16})$/.exec(value ?? '')
  return m ? m[1] : null
}

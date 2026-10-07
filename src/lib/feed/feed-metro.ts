// T155 (#52) — the feed's vantage point becomes a metro.
//
// Why this is a second resolver rather than a parameter on the place one:
// `locality_feed_items` intersects `places.geography`, and `places.kind` is
// constrained to region / state / county / city / neighborhood (migration 017)
// — there is no metro value in that enum. Metro is a separate overlay table
// with its own polygon (migration 031). Metro-grain resolution reads a
// different table; it is not a configured call of the first.
//
// Model-independent, and checked rather than assumed: `metro_polygons`
// references no Item table and no `discoverable_items`. It is geography plus
// `members.home_metro_id`. Nothing here survives or falls with Items.

import type { SupabaseClient } from '@supabase/supabase-js'
import { decodeEwkbPoint } from '@/lib/explore/ewkb'

/** The seeded Sacramento CSA — migration 031's one seeded row. */
export const DEFAULT_METRO_SLUG = 'sacramento-roseville-ca'

export interface FeedMetro {
  id: string
  slug: string
  name: string
  /**
   * Does the platform actually serve this metro today?
   *
   * T156 folded `explore/metros.ts`'s `fetchChoosableMetros` into this
   * function, which was reading the same table for the same picker. The flag
   * came with it, and it is not decoration: exactly one metro is open and 296
   * are seeded, so a picker offering all 296 as equals would claim coverage
   * the platform does not have. 295 carry no polygon and no centroid — the
   * waitlist migration dropped both NOT NULLs — so choosing one could only
   * relabel the surface while the results underneath stayed identical.
   */
  isOpen: boolean
  /** [lng, lat] of the metro's centre; absent for the waitlist-only metros. The map opens here. */
  center?: [number, number]
  /**
   * How many people are waiting here, as of the last cache refresh.
   *
   * Undefined when nothing has merged the cached counts in — a surface that
   * did not ask for them, or a metro missing from the snapshot. Undefined
   * renders no number and sorts last; it is not zero, and the difference
   * matters because "nobody yet" and "we do not know" read the same to a
   * person and should not.
   *
   * ALWAYS THE CACHED FIGURE. See `@/lib/metro/waitlist-counts`: a live count
   * anywhere on this path reintroduces the oracle, and a sorted list is a
   * particularly good oracle because it exposes every metro at once.
   */
  waiting?: number
}

type FromClient = Pick<SupabaseClient, 'from'>

const TABLE = 'metro_polygons'
const COLUMNS = 'id, slug, name, is_open, centroid'

async function one(
  supabase: FromClient,
  column: 'id' | 'slug',
  value: string,
): Promise<FeedMetro | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq(column, value)
    .maybeSingle()
  if (error) throw error
  return toMetro(data as MetroRow | null)
}

interface MetroRow {
  id: string
  slug: string
  name: string
  is_open: boolean
  centroid?: string | null
}

function toMetro(row: MetroRow | null): FeedMetro | null {
  if (!row) return null
  const c = decodeEwkbPoint(row.centroid)
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    isOpen: row.is_open,
    ...(c ? { center: [c.longitude, c.latitude] as [number, number] } : {}),
  }
}

/**
 * Resolve the metro a feed is read from.
 *
 * Precedence: **requestedSlug → memberMetroId → default metro.**
 *
 * Same precedence as `resolveFeedPlace`: requested → stored → default. That
 * used to be an inversion worth calling out — the Place resolver read the
 * stored value first, which is why the shipped scope picker did nothing. Fixed
 * 2026-09-17; the two now agree, and an explicit act by a person beats a stored
 * default in both.
 */
export async function resolveFeedMetro(
  supabase: FromClient,
  opts: { memberMetroId?: string | null; requestedSlug?: string | null },
): Promise<FeedMetro | null> {
  if (opts.requestedSlug) {
    const m = await one(supabase, 'slug', opts.requestedSlug)
    if (m) return m
  }
  if (opts.memberMetroId) {
    const m = await one(supabase, 'id', opts.memberMetroId)
    if (m) return m
  }
  return one(supabase, 'slug', DEFAULT_METRO_SLUG)
}

/**
 * The metros the switcher offers — every seeded row, `isOpen` saying which
 * ones the platform actually serves.
 *
 * There is exactly one open today. The rural hole is real and this does not
 * close it: `members.home_metro_id` is null outside every seeded CSA, and the
 * default keeps the surface non-blank without making it relevant to someone in
 * another state. A known limitation of a one-metro launch.
 */
export async function listFeedMetros(supabase: FromClient): Promise<FeedMetro[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    // Open first, then alphabetical — a picker lands where a person expects
    // within each group, and the served metros are what they came for.
    .order('is_open', { ascending: false })
    .order('name')
  if (error) throw error
  return ((data ?? []) as MetroRow[]).map((r) => toMetro(r)!)
}

/**
 * The switcher's two groups.
 *
 * Exactly one metro is open today and 296 are seeded. A flat list of 296 as
 * equals would imply we cover all of them, so the served ones come first under
 * their own heading and the rest are named as what they are — places you can
 * point at, not places we run in.
 */
export function splitByOpen(metros: readonly FeedMetro[]): {
  open: FeedMetro[]
  notYet: FeedMetro[]
} {
  return {
    open: metros.filter((m) => m.isOpen),
    // MOST WANTED FIRST — Don asked for this: "it would be cool to sort those
    // metros by number of people signed up". It is a demand signal for where to
    // open next, and for a person it answers "is anyone else here?" before they
    // have to tap anything.
    //
    // Alphabetical is the tiebreak, so the 200-odd metros nobody has asked for
    // keep the order they had rather than shuffling on every refresh.
    // Unknown sorts as -1, below a genuine zero: "we do not know" is not "nobody".
    notYet: metros
      .filter((m) => !m.isOpen)
      .slice()
      .sort((a, b) => {
        const wa = a.waiting ?? -1
        const wb = b.waiting ?? -1
        return wb - wa || a.name.localeCompare(b.name)
      }),
  }
}

/** Merge the cached waiting counts onto a metro list. */
export function withWaitingCounts(
  metros: readonly FeedMetro[],
  counts: ReadonlyMap<string, number>,
): FeedMetro[] {
  return metros.map((m) => {
    const waiting = counts.get(m.id)
    return waiting === undefined ? m : { ...m, waiting }
  })
}

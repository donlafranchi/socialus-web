// F076 — the waiting count, served from a cache rather than read live.
//
// RULED 2026-09-23, reversing 2026-09-22 (#196). Don: *"how would anyone know
// about anybody elses emails with just a count? ... Nobody would be able to
// know anything else except someone else somewhere else also found this site.
// they could have even chosen the wrong area."*
//
// The earlier ruling was right about the mechanism and wrong about the stakes.
// The oracle is real — submit an address, watch whether the number moves, learn
// whether it was already there — but what it reveals is "this address expressed
// interest in a local app before launch", and that does not justify removing
// something useful.
//
// HOW THE COUNT COMES BACK WITHOUT THE ORACLE.
// The leak never came from the number existing. It came from the number being
// recomputed and re-displayed IN RESPONSE TO YOUR OWN WRITE: read it before the
// write and two submissions differ; read it after and a single probe differs.
// Either way the thing you are shown is a function of what you just did.
//
// So the number is no longer a function of what you just did. This reads a
// figure that was current some time ago, and every surface reads the SAME
// figure — the popup after submitting, and the metro picker's ordering. A
// submission does not move it, so differencing across submissions returns
// nothing to difference.
//
// WHAT THIS DOES NOT CLOSE, STATED PLAINLY BECAUSE THE LAST VERSION OF THIS
// FILE OVERCLAIMED AND WAS WRONG.
// After the window expires the figure refreshes. In a metro where nothing else
// happened in that window, a person who submitted an address and waited could
// see it move by one and attribute that to themselves. That is inherent to a
// cache and no TTL removes it — a longer window makes it rarer and staler, a
// shorter one fresher and more attributable. It is weakest in a metro with real
// demand and strongest in an empty one, which is where the answer is least
// interesting. Ruled acceptable; recorded so nobody re-derives it as new.
//
// NOT pg_cron: it is not installed on this project (checked, not assumed), so a
// database-side scheduled refresh would need the extension enabled in
// production before any of this could ship. Next's data cache is shared across
// instances on Vercel and needs nothing new, which is why it is the mechanism.
//
// NO MIGRATION, AND THIS FILE IS WHERE THE NEW RULING LIVES BECAUSE OF THAT.
// `metro_polygons.creator_count` / `patron_count` already exist and are already
// maintained incrementally by the join handlers, so the schema does not move
// for any of this.
//
// An earlier draft of this change rewrote the header of
// `supabase/migrations/20260922034637_metro_waitlist_anonymous.sql` to record
// the reversal. That header still says *"RULED: an anonymous submitter is shown
// NO COUNT"*, AND IT IS LEFT SAYING SO ON PURPOSE. An applied migration is a
// dated record of what was true when it ran — the same rule DECISIONS.md states
// for itself: append only, never edit a past line, a reversal is a new line
// that says what it replaces. Editing it would also have been invisible to
// every check we have: `scripts/check-migration-drift.sh` compares the VERSION
// rows on each side and never the content, so a file that no longer matches
// what production ran cannot go red.
//
// The record of the reversal is `ops-pattern/DECISIONS.md` 2026-09-23, F076
// criteria 7, 8, 14 and 16, and this file.

import { unstable_cache } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase-server'

/**
 * How stale the number is allowed to be.
 *
 * One hour. Short enough that Don can watch a metro fill over a day, long
 * enough that a submission is very unlikely to be the only thing inside the
 * window — and the residual above is about being the only thing, not about the
 * length as such.
 */
export const WAITLIST_COUNT_TTL_SECONDS = 60 * 60

export const WAITLIST_COUNT_TAG = 'metro-waitlist-counts'

export interface MetroWaitingCount {
  metroId: string
  /** creators + patrons, as of the last refresh. Never recomputed per request. */
  waiting: number
}

interface Row {
  id: string
  creator_count: number
  patron_count: number
}

/**
 * Every metro's waiting count, as of at most `WAITLIST_COUNT_TTL_SECONDS` ago.
 *
 * ONE READ SERVES EVERY SURFACE. The popup and the picker's ordering must show
 * the same figure — a live count anywhere reintroduces the oracle through that
 * surface, and a sorted list is a particularly good oracle because it exposes
 * every metro at once.
 *
 * `metro_polygons.creator_count` / `patron_count` are already maintained
 * incrementally by the join handlers, so there is no per-request recomputation
 * here or anywhere — this is one cheap read of two columns, cached.
 */
export const getMetroWaitingCounts = unstable_cache(
  async (): Promise<MetroWaitingCount[]> => {
    const supabase = await createServerClient()
    const { data, error } = await supabase
      .from('metro_polygons')
      .select('id, creator_count, patron_count')
    if (error) throw error
    return ((data ?? []) as Row[]).map((r) => ({
      metroId: r.id,
      waiting: (r.creator_count ?? 0) + (r.patron_count ?? 0),
    }))
  },
  ['metro-waitlist-counts-v1'],
  { revalidate: WAITLIST_COUNT_TTL_SECONDS, tags: [WAITLIST_COUNT_TAG] },
)

/** The cached counts as a lookup. */
export async function waitingCountByMetro(): Promise<Map<string, number>> {
  const rows = await getMetroWaitingCounts()
  return new Map(rows.map((r) => [r.metroId, r.waiting]))
}

/**
 * One metro's cached count, or null when it is not in the cached set.
 *
 * Null rather than 0: a metro nobody has heard of and a metro missing from the
 * snapshot are different facts, and showing "0 of 300" for the second is a
 * confident wrong answer.
 */
export async function waitingCountFor(metroId: string): Promise<number | null> {
  return (await waitingCountByMetro()).get(metroId) ?? null
}

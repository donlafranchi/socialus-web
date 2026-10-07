// T156 — the one read Browse is built on, shared by the page and the refetch.
//
// It lives here rather than in `@/lib/browse` because it reaches for the
// cookie-bound Supabase client: this is the seam where a request becomes a
// reader, and everything under `@/lib/browse` stays a pure function of the
// rows it is handed, which is why those modules are testable without a
// database.
//
// THE PERSONAL HALF IS HERE NOW (T169, #203 — F059 criteria 2b and 2c), and
// the previous note was right that nothing had to change shape: it is a second
// `getBrowseFeed` call with the follow set, and the SQL was already doing the
// withholding.
//
// TWO CASES THAT LOOK THE SAME AND ARE NOT:
//   - SIGNED OUT — the second call is never made, and no follow set is even
//     resolved. There is no member, so there is no set. Nothing reaches the
//     browser to hide, which is the strongest reading of criterion 2c.
//   - SIGNED IN WITH NO FOLLOWS — the call IS made, with an empty array, and
//     `browse_feed`'s predicate (`p_audience = 'public' or g.id = any(...)`)
//     matches nothing against it. THE WITHHOLDING STAYS IN THE QUERY.
//     Short-circuiting this case would move the rule into TypeScript, where
//     the next person can change it without noticing they have. It costs one
//     cheap RPC for a member who follows nothing yet, and it buys the property
//     being structural instead of conditional. A test asserts the call happens.
//
// ATTACHMENT DECIDES THIS, NOT AUTHORITY. `resolveFollowedPageIds` reads
// `group_memberships.relationship`; `role` is a different column answering a
// different question, and #172 split them on purpose. An owner who never
// followed their own Page does not get its announcements here, and that is
// correct rather than an oversight.
//
// What auth IS for here: the banner, and the fact that resolving it on the
// server is what makes server-side withholding possible at all. While Browse
// was a client component reading `discoverable_items` through
// `createBrowserClient`, "withheld server-side, never rendered and hidden"
// (criterion 2c) was not a thing anyone could verify — every row the surface
// held had already been shipped to the browser. That is the prerequisite this
// change buys, not a refactor.

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { METRO_COOKIE } from '@/lib/browse/remembered-metro'
import { getBrowseFeed } from '@/lib/feed/browse-feed'
import { getWithheldAnnouncements } from '@/lib/feed/withheld-announcements'
import { metroWeekBounds } from '@/lib/metro/metro-week'
import { happeningWindows } from '@/lib/metro/happening'
import { resolveFollowedPageIds } from '@/lib/feed/followed-pages'
import { listFeedMetros, withWaitingCounts, type FeedMetro } from '@/lib/feed/feed-metro'
import { waitingCountByMetro } from '@/lib/metro/waitlist-counts'
import { resolveBrowseScope } from '@/lib/browse/scope'
import { loadMapMix } from '@/lib/map/load-mix'
import type { MixedResult } from '@/lib/map/mix'
import type { BrowseResult } from '@/lib/feed/browse-feed'
import type { BrowseSnapshot, HappeningSnapshot } from '@/lib/browse/snapshot'

export type { BrowseSnapshot }

type FeedScope = { metroId: string } | { placeId: string }

/** The corpus a client-side filter is allowed to treat as "everything". */
export const BROWSE_LIMIT = 100

export async function loadBrowse(requestedSlug: string | null, areaId: string | null = null): Promise<BrowseSnapshot> {
  const supabase = await createClient()

  // The switcher's options depend on nothing else, so they start first rather
  // than waiting behind three round trips they have no relationship to.
  const metrosPromise = listFeedMetros(supabase).catch(() => [] as FeedMetro[])

  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user ?? null

  // Sequential because the scope depends on it: precedence is requested slug,
  // then this, then the default.
  const member = user ? await memberMetros(supabase, user.id) : null
  const rememberedSlug = user ? null : await rememberedMetroSlug()
  const scope = await resolveBrowseScope(supabase, {
    memberMetroId: member?.home ?? null,
    memberDefaultMetroId: member?.default ?? null,
    requestedSlug,
    ...(rememberedSlug ? { rememberedSlug } : {}),
  })
  // The CACHED counts, merged here so the picker can order by them and the
  // popup can show one — the same figure in both places, which is the whole
  // point. A failure costs the ordering and the number, never the picker.
  const metros = withWaitingCounts(
    await metrosPromise,
    await waitingCountByMetro().catch(() => new Map<string, number>()),
  )

  const base = { metros, signedIn: Boolean(user), happening: NO_ROWS, map: [] as MixedResult[], area: null as BrowseSnapshot['area'] }
  if (!scope) {
    return { ...base, results: [], following: [], metro: null, chosen: false, failed: false }
  }

  // #476 — a neighbourhood narrows every read below to that place. An id that
  // is not a neighbourhood is ignored, never an error: the whole metro shows.
  const area = areaId ? await neighborhood(supabase, areaId) : null
  const feedScope = area ? { placeId: area.id } : { metroId: scope.metro.id }

  // Started before the public read is awaited: it depends on the member and
  // the scope, neither of which the public read can change.
  const followingPromise = user
    ? followedFeed(supabase, user.id, feedScope)
    : Promise.resolve([] as BrowseResult[])

  // F091 — signed in, the rows are posts. Signed out, only the today row
  // fills, with the front door's withheld card (Don, 2026-10-01).
  const happeningPromise = user
    ? happeningRows(supabase, feedScope)
    : signedOutToday(supabase, feedScope)

  // F093 — SIGNED OUT, ANNOUNCEMENTS COME FROM THE WITHHELD PATH.
  //
  // `browse_feed` is `security invoker` and `page_posts` has no anonymous read
  // any more, so it would return no post rows to a stranger anyway. Asking it
  // for Pages only is not what does the withholding — the policy is — it just
  // says out loud which half of the corpus this call is for, and makes it
  // impossible for one announcement to arrive down both paths if the policy
  // is ever loosened.
  //
  // Criterion 7: the rows STAY, in withheld form. A signed-out Explore
  // carrying only Pages leaks nothing and is still wrong — it is the
  // difference between a directory and a place that is visibly alive, which
  // is the whole reason this ruling is not "announcements require an account".
  const signedOut = !user
  // #331 — signed out, no pins (the front door, F093).
  const mapPromise = user
    ? loadMapMix(supabase, scope.metro.id, new Date(), area?.id).catch((error) => {
        console.error('[loadBrowse] map mix failed:', (error as Error).message)
        return [] as MixedResult[]
      })
    : Promise.resolve([] as MixedResult[])
  let withheldFailed = false
  const withheldPromise = signedOut
    ? getWithheldAnnouncements(supabase, {
        scope: feedScope,
        // The period the count on the card is over, in the metro's own week.
        period: metroWeekBounds(),
        limit: BROWSE_LIMIT,
      }).catch((error) => {
        console.error('[loadBrowse] withheld announcements failed:', (error as Error).message)
        withheldFailed = true
        return [] as BrowseResult[]
      })
    : Promise.resolve([] as BrowseResult[])

  try {
    const results = await getBrowseFeed(supabase, {
      scope: feedScope,
      resultKinds: signedOut ? ['page'] : null,
      limit: BROWSE_LIMIT,
    })
    const following = await followingPromise
    const withheld = await withheldPromise
    return {
      ...base,
      happening: await happeningPromise,
      map: await mapPromise,
      results: mergeByRecency(results, withheld),
      following,
      metro: scope.metro,
      area,
      chosen: scope.chosen,
      failed: withheldFailed,
    }
  } catch (error) {
    // Loud, and distinguishable. An empty surface that means "the query is
    // broken" must not read as "nothing is here yet" — the empty state invites
    // someone to clear filters that were never the problem.
    console.error('[loadBrowse] browse_feed failed:', (error as Error).message)
    return {
      ...base,
      results: [],
      following: await followingPromise,
      happening: await happeningPromise,
      map: await mapPromise,
      metro: scope.metro,
      area,
      chosen: scope.chosen,
      failed: true,
    }
  }
}

/**
 * Two result sets as one list, newest first.
 *
 * `browse_feed` already ordered its own rows and the withheld read ordered
 * its own; neither knows about the other, so the interleave happens here. One
 * sort key (`sortAt`) rather than two lists on the surface, because F059
 * criterion 2 asks for Pages and posts TOGETHER and a second row would be a
 * second answer to what Browse is.
 */
function mergeByRecency(a: BrowseResult[], b: BrowseResult[]): BrowseResult[] {
  if (b.length === 0) return a
  return [...a, ...b].sort((x, y) => (x.sortAt < y.sortAt ? 1 : x.sortAt > y.sortAt ? -1 : 0))
}

/**
 * Announcements from Pages this member gets updates from, in this metro.
 *
 * A FAILURE HERE COSTS THE ROW, NEVER THE SURFACE — and that is the opposite
 * of the rule the public read follows, deliberately. `failed` exists so an
 * empty public list cannot be mistaken for "nothing is here yet"; there is no
 * such confusion to prevent here, because the row HIDES when it is empty
 * (criterion 2b's presentation) and a hidden row and an absent row read the
 * same to the person. Turning a broken personal read into a broken Browse
 * would be a worse trade than losing one row.
 *
 * It is still logged, because silence is how the 2026-09-11 drift lasted.
 */
async function followedFeed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  memberId: string,
  scope: FeedScope,
): Promise<BrowseResult[]> {
  try {
    const following = await resolveFollowedPageIds(supabase, memberId)
    // Called even when `following` is empty — see the note at the top.
    return await getBrowseFeed(supabase, {
      scope,
      audience: { audience: 'following', following },
      limit: BROWSE_LIMIT,
    })
  } catch (error) {
    console.error('[loadBrowse] following feed failed:', (error as Error).message)
    return []
  }
}

const NO_ROWS: HappeningSnapshot = { today: [], thisWeek: [], thisWeekend: [] }
const ROW_LIMIT = 20

/**
 * F091 — one time-windowed, soonest-first read per row. Like the following
 * row, a failure costs the rows, never the surface: an absent row and a broken
 * one read the same, and both are logged.
 */
async function happeningRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: FeedScope,
): Promise<HappeningSnapshot> {
  const w = happeningWindows()
  const row = (win: { from: string; to: string }) =>
    getBrowseFeed(supabase, {
      scope,
      resultKinds: ['post'],
      startsFrom: win.from,
      startsBefore: win.to,
      sort: 'soonest',
      limit: ROW_LIMIT,
    })
  try {
    const [today, thisWeek, thisWeekend] = await Promise.all([row(w.today), row(w.thisWeek), row(w.thisWeekend)])
    return { today, thisWeek, thisWeekend }
  } catch (error) {
    console.error('[loadBrowse] happening rows failed:', (error as Error).message)
    return NO_ROWS
  }
}

/**
 * Signed out: one "Sign in to see what's happening" card for each Page that
 * posted something today. "Today" is when it was posted, never when it
 * happens — the withheld read counts by created_at so nobody can sweep it to
 * learn when things take place.
 */
async function signedOutToday(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: FeedScope,
): Promise<HappeningSnapshot> {
  try {
    const rows = await getWithheldAnnouncements(supabase, {
      scope,
      period: happeningWindows().postedToday,
      limit: ROW_LIMIT,
    })
    return { ...NO_ROWS, today: rows.filter((r) => (r.announcementCount ?? 0) > 0) }
  } catch (error) {
    console.error('[loadBrowse] signed-out today row failed:', (error as Error).message)
    return NO_ROWS
  }
}

/** The member's zip-derived metro and their own default-metro setting. Null is normal. */
async function memberMetros(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ home: string | null; default: string | null }> {
  const { data } = await supabase
    .from('members')
    .select('home_metro_id, default_metro_id')
    .eq('id', userId)
    .maybeSingle()
  const row = data as { home_metro_id: string | null; default_metro_id?: string | null } | null
  return { home: row?.home_metro_id ?? null, default: row?.default_metro_id ?? null }
}

/** Signed-out visitors: the last metro they picked here. A missing cookie store is not an error. */
async function rememberedMetroSlug(): Promise<string | null> {
  try {
    return (await cookies()).get(METRO_COOKIE)?.value || null
  } catch {
    return null
  }
}

/** #476 — a neighbourhood by id, or null when the id is not one. */
async function neighborhood(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from('places')
    .select('id, display_name')
    .eq('id', id)
    .eq('kind', 'neighborhood')
    .maybeSingle()
  const row = data as { id: string; display_name: string } | null
  return row ? { id: row.id, name: row.display_name } : null
}

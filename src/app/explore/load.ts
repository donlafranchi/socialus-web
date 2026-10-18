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
import { viewerId } from '@/lib/auth/viewer'
import { METRO_COOKIE } from '@/lib/browse/remembered-metro'
import { getBrowseFeed, getHappening } from '@/lib/feed/browse-feed'
import { getWithheldAnnouncements } from '@/lib/feed/withheld-announcements'
import { metroWeekBounds } from '@/lib/metro/metro-week'
import { happeningWindows } from '@/lib/metro/happening'
import { resolveFollowedPageIds } from '@/lib/feed/followed-pages'
import { listFeedMetros, withWaitingCounts, type FeedMetro } from '@/lib/feed/feed-metro'
import { waitingCountByMetro } from '@/lib/metro/waitlist-counts'
import { resolveBrowseScope } from '@/lib/browse/scope'
import { sessionShuffle, seedFromCookie, SEED_COOKIE } from '@/lib/browse/session-shuffle'
import { mixRuns } from '@/lib/browse/mix-runs'
import { pickLead, seenBefore, leadKey, LEAD_SIZE, SEEN_COOKIE } from '@/lib/browse/lead'
import { feedOptsFor, hasBrowseFilters, isPlainPostsView, type BrowseFilters } from '@/lib/browse/filters'
import { lastVisitFrom, VISIT_COOKIE } from '@/lib/browse/visits'
import { loadMapMix } from '@/lib/map/load-mix'
import { withLocationKinds } from '@/lib/map/location-kinds'
import type { MixedResult } from '@/lib/map/mix'
import type { BrowseResult } from '@/lib/feed/browse-feed'
import type { BrowseSnapshot, HappeningSnapshot } from '@/lib/browse/snapshot'

export type { BrowseSnapshot }

type FeedScope = { metroId: string } | { placeId: string }

/** The corpus a client-side filter is allowed to treat as "everything". */
export const BROWSE_LIMIT = 100

export async function loadBrowse(
  requestedSlug: string | null,
  areaId: string | null = null,
  // #549 — the page and the refetch leave the map to its own read (`loadMap`): it is a
  // three-round chain nothing on the list waits for, and a phone does not show it first.
  // #557 — the session seed: same seed, same order; a new sign-in brings a new one.
  // #876 — the Type / Category / Date filters, pushed into one targeted read.
  { withMap = true, seed = null, filters = null }: { withMap?: boolean; seed?: string | null; filters?: BrowseFilters | null } = {},
): Promise<BrowseSnapshot> {
  const supabase = await createClient()

  // The switcher's options depend on nothing else, so they start first rather
  // than waiting behind three round trips they have no relationship to.
  const metrosPromise = listFeedMetros(supabase).catch(() => [] as FeedMetro[])
  const waitingPromise = waitingCountByMetro().catch(() => new Map<string, number>())
  const areaPromise = areaId ? neighborhood(supabase, areaId) : Promise.resolve(null)

  // #791 — who is looking, from the session's verified claims: no round trip.
  const userId = await viewerId(supabase)
  // Their follow set depends on nothing but who they are, so it starts now rather
  // than behind the metro reads. A failure is the following row's, caught there.
  const followIdsPromise = userId ? resolveFollowedPageIds(supabase, userId) : null
  followIdsPromise?.catch(() => {})

  // Sequential because the scope depends on it: precedence is requested slug,
  // then this, then the default.
  const member = userId ? await memberMetros(supabase, userId) : null
  const rememberedSlug = userId ? null : await rememberedMetroSlug()
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
    await waitingPromise,
  )

  const base = { metros, signedIn: Boolean(userId), happening: NO_ROWS, map: [] as MixedResult[], area: null as BrowseSnapshot['area'] }
  if (!scope) {
    return { ...base, results: [], following: [], metro: null, chosen: false, failed: false }
  }

  // #476 — a neighbourhood narrows every read below to that place. An id that
  // is not a neighbourhood is ignored, never an error: the whole metro shows.
  const area = await areaPromise
  const feedScope = area ? { placeId: area.id } : { metroId: scope.metro.id }

  // #876 — a filter is one targeted read: no first look, no rows (signed out, posts only reads the withheld cards).
  if (filters && hasBrowseFilters(filters)) {
    // F093 criterion 7 — signed out, posts only is the withheld cards, as on the mix. A narrower
    // filter (kind, date, following) would say what a withheld post is; browse_feed gives anon no posts.
    if (!userId && isPlainPostsView(filters)) {
      try {
        const results = await getWithheldAnnouncements(supabase, { scope: feedScope, period: metroWeekBounds(), limit: BROWSE_LIMIT })
        return { ...base, results, lead: [], leadFresh: false, following: [], metro: scope.metro, area, chosen: scope.chosen, failed: false }
      } catch (error) {
        console.error('[loadBrowse] signed-out posts view failed:', (error as Error).message)
        return { ...base, results: [], following: [], metro: scope.metro, area, chosen: scope.chosen, failed: true }
      }
    }
    const o = feedOptsFor(filters, new Date())
    try {
      const followIds = (await followIdsPromise?.catch(() => [] as string[])) ?? []
      const results = await getBrowseFeed(supabase, {
        scope: feedScope,
        resultKinds: o.resultKinds,
        postKinds: o.postKinds,
        tags: o.tags,
        startsFrom: o.startsFrom,
        startsBefore: o.startsBefore,
        sort: o.sort,
        limit: BROWSE_LIMIT,
        ...(o.following ? { audience: { audience: 'following' as const, following: followIds } } : {}),
      })
      return { ...base, results: markFollowed(results, followIds), lead: [], leadFresh: false, following: [], metro: scope.metro, area, chosen: scope.chosen, failed: false }
    } catch (error) {
      console.error('[loadBrowse] filtered browse_feed failed:', (error as Error).message)
      return { ...base, results: [], following: [], metro: scope.metro, area, chosen: scope.chosen, failed: true }
    }
  }

  // Started before the public read is awaited: it depends on the member and
  // the scope, neither of which the public read can change.
  const followingPromise = followIdsPromise
    ? followedFeed(supabase, followIdsPromise, feedScope)
    : Promise.resolve([] as BrowseResult[])

  // F091 — signed in, the rows are posts. Signed out, only the today row
  // fills, with the front door's withheld card (Don, 2026-10-01).
  const happeningPromise = userId
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
  const signedOut = !userId
  // #331 — signed out, no pins (the front door, F093).
  const mapPromise = userId && withMap ? loadMap(supabase, scope.metro.id, area?.id) : Promise.resolve([] as MixedResult[])
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
    const happening = await happeningPromise
    const now = new Date()
    // #876 (Don, 2026-10-16) — everything mixed: Pages, posts, and the updates of Pages the member
    // follows, each once, in the session's place-and-time order.
    const followIds = (await followIdsPromise?.catch(() => [] as string[])) ?? []
    const mixed = markFollowed(uniqueResults([...results, ...following]), followIds)
    const shuffled = sessionShuffle(mergeByRecency(mixed, withheld), seed, {
      id: (r) => `${r.resultKind}:${r.resultId}`,
      at: (r) => r.sortAt,
      now,
    })
    // #897 — no more than 2 in a row of one category; only undated rows move, dated posts keep their slots.
    const mixedRuns = mixRuns(shuffled, { tags: (r) => r.tags ?? [], movable: (r) => !r.startsAt })
    // #796 — the first look, from rows already in hand: no read of its own.
    const memory = await exploreMemory(seed)
    // #796 — a post this browser has already been shown never pins to the top: it waits below the first screen.
    const ordered = keepSeenPostsBelow(mixedRuns, memory.seen)
    const { lead, fresh } = pickLead([...ordered, ...happening.today, ...happening.thisWeekend], { now, seed, ...memory })
    return {
      ...base,
      happening,
      map: await mapPromise,
      results: ordered,
      lead,
      leadFresh: fresh,
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

/** The pins for a signed-in member. A failure costs the pins, never the surface. */
async function loadMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  metroId: string,
  areaId?: string | null,
): Promise<MixedResult[]> {
  try {
    return await withLocationKinds(supabase, await loadMapMix(supabase, metroId, new Date(), areaId))
  } catch (error) {
    console.error('[loadBrowse] map mix failed:', (error as Error).message)
    return []
  }
}

/** #549 — the map's own read, after the list has painted. Empty signed out: no pins there (#331). */
export async function loadMemberMap(metroId: string, areaId: string | null): Promise<MixedResult[]> {
  const supabase = await createClient()
  return (await viewerId(supabase)) ? loadMap(supabase, metroId, areaId) : []
}

/** The first screen: a seen post is moved below it, everything else keeps its place. */
const FIRST_SCREEN = LEAD_SIZE

function keepSeenPostsBelow(rows: BrowseResult[], seen: Set<string>): BrowseResult[] {
  if (seen.size === 0) return rows
  const top: BrowseResult[] = []
  const held: BrowseResult[] = []
  const rest: BrowseResult[] = []
  for (const r of rows) {
    if (top.length < FIRST_SCREEN) (r.resultKind === 'post' && seen.has(leadKey(r)) ? held : top).push(r)
    else rest.push(r)
  }
  return [...top, ...held, ...rest]
}

/** One of each result, first seen wins. */
function uniqueResults(rows: BrowseResult[]): BrowseResult[] {
  const seen = new Set<string>()
  return rows.filter((r) => {
    const k = `${r.resultKind}:${r.resultId}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** #876 — the Following filter's field, set wherever a Page the member follows shows up. */
function markFollowed(rows: BrowseResult[], followIds: readonly string[]): BrowseResult[] {
  if (followIds.length === 0) return rows
  const ids = new Set(followIds)
  return rows.map((r) => (ids.has(r.groupId) ? { ...r, followed: true } : r))
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
  followIds: Promise<string[]>,
  scope: FeedScope,
): Promise<BrowseResult[]> {
  try {
    const following = await followIds
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
 * F091 — the three time-windowed, soonest-first rows, in one read (#791). Like
 * the following row, a failure costs the rows, never the surface: an absent
 * row and a broken one read the same, and both are logged.
 */
async function happeningRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: FeedScope,
): Promise<HappeningSnapshot> {
  try {
    return await getHappening(supabase, scope, happeningWindows(), ROW_LIMIT)
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

/** #557 — this session's shuffle seed (set by the proxy), or null when there is none. */
export async function readSessionSeed(): Promise<string | null> {
  try {
    return seedFromCookie((await cookies()).get(SEED_COOKIE)?.value)
  } catch {
    return null
  }
}

/** #796 — when this browser last visited, and what an earlier visit's first look already showed. */
async function exploreMemory(seed: string | null): Promise<{ lastVisit: Date | null; seen: Set<string> }> {
  try {
    const jar = await cookies()
    return { lastVisit: lastVisitFrom(jar.get(VISIT_COOKIE)?.value), seen: seenBefore(jar.get(SEEN_COOKIE)?.value, seed) }
  } catch {
    return { lastVisit: null, seen: new Set() }
  }
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

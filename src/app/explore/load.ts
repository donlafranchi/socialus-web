// T156 — the one read Browse is built on, shared by the page and the refetch.
//
// It lives here rather than in `@/lib/browse` because it reaches for the
// cookie-bound Supabase client: this is the seam where a request becomes a
// reader, and everything under `@/lib/browse` stays a pure function of the
// rows it is handed, which is why those modules are testable without a
// database.
//
// THE PERSONAL HALF IS NOT HERE, DELIBERATELY. `audience` stays `public` —
// announcements from Pages a person follows (F059 criterion 2b) is its own
// ticket after this one, so Don judges one PR at a time. `getBrowseFeed`
// already takes the follow set and the SQL already withholds on it; what is
// missing is only the caller passing it. Nothing here needs to change shape
// when it lands.
//
// What auth IS for here: the banner, and the fact that resolving it on the
// server is what makes server-side withholding possible at all. While Browse
// was a client component reading `discoverable_items` through
// `createBrowserClient`, "withheld server-side, never rendered and hidden"
// (criterion 2c) was not a thing anyone could verify — every row the surface
// held had already been shipped to the browser. That is the prerequisite this
// change buys, not a refactor.

import { createClient } from '@/lib/supabase-server'
import { getBrowseFeed } from '@/lib/feed/browse-feed'
import { listFeedMetros, type FeedMetro } from '@/lib/feed/feed-metro'
import { resolveBrowseScope } from '@/lib/browse/scope'
import type { BrowseSnapshot } from '@/lib/browse/snapshot'

export type { BrowseSnapshot }

/** The corpus a client-side filter is allowed to treat as "everything". */
export const BROWSE_LIMIT = 100

export async function loadBrowse(requestedSlug: string | null): Promise<BrowseSnapshot> {
  const supabase = await createClient()

  // The switcher's options depend on nothing else, so they start first rather
  // than waiting behind three round trips they have no relationship to.
  const metrosPromise = listFeedMetros(supabase).catch(() => [] as FeedMetro[])

  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user ?? null

  // Sequential because the scope depends on it: precedence is requested slug,
  // then this, then the default.
  const memberMetroId = user ? await homeMetroId(supabase, user.id) : null
  const scope = await resolveBrowseScope(supabase, { memberMetroId, requestedSlug })
  const metros = await metrosPromise

  const base = { metros, signedIn: Boolean(user) }
  if (!scope) return { ...base, results: [], metro: null, chosen: false, failed: false }

  try {
    const results = await getBrowseFeed(supabase, {
      scope: { metroId: scope.metro.id },
      limit: BROWSE_LIMIT,
    })
    return { ...base, results, metro: scope.metro, chosen: scope.chosen, failed: false }
  } catch (error) {
    // Loud, and distinguishable. An empty surface that means "the query is
    // broken" must not read as "nothing is here yet" — the empty state invites
    // someone to clear filters that were never the problem.
    console.error('[loadBrowse] browse_feed failed:', (error as Error).message)
    return { ...base, results: [], metro: scope.metro, chosen: scope.chosen, failed: true }
  }
}

/** The member's derived home metro. Null is normal — the rural fallback. */
async function homeMetroId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('members')
    .select('home_metro_id')
    .eq('id', userId)
    .maybeSingle()
  return (data as { home_metro_id: string | null } | null)?.home_metro_id ?? null
}

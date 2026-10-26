'use server'

// Refetching Browse without leaving the surface.
//
// Changing metro goes through here rather than through a navigation, for one
// reason that is not performance: the metro stays SERVER-resolved. A client
// that refetched for itself would need the scope rules — precedence, the
// stale-slug fallback, whether anybody chose it — duplicated in the browser,
// and the two copies would drift. The surface keeps showing the previous page
// until this resolves, so a metro change reads as a change of scope rather
// than as a page load.
//
// #329 — a metro picked here is also remembered: on this device (cookie), and
// as the member's default metro when signed in.

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { memberDefaultMetroSet } from '@/actions'
import { METRO_COOKIE, METRO_COOKIE_MAX_AGE } from '@/lib/browse/remembered-metro'
import { withTransaction } from '@/actions/_lib/db'
import { searchNeighborhoods } from '@/lib/places/neighborhood-search'
import { loadBrowse, loadMemberMap, readSessionSeed, type BrowseSnapshot } from './load'
import { SEEN_COOKIE, SEEN_COOKIE_MAX_AGE, recordSeen } from '@/lib/browse/lead'
import type { MixedResult } from '@/lib/map/mix'
import type { BrowseFilters } from '@/lib/browse/filters'
import { parseReach, type Reach } from '@/lib/browse/reach'

export async function browseFeedAction(
  metroSlug: string | null,
  areaId: string | null = null,
  filters: BrowseFilters | null = null,
  search: string | null = null,
  reach: Reach | null = null,
): Promise<BrowseSnapshot> {
  // #876 — the filters ride along: a filtered Explore is one targeted read. #916 — and so does a search. #922 — and the member's reach.
  const snapshot = await loadBrowse(metroSlug, areaId, {
    withMap: false,
    seed: await readSessionSeed(),
    filters,
    search,
    reach: parseReach(reach === null ? null : String(reach)),
  })
  if (!filters && !search && metroSlug && snapshot.metro?.slug === metroSlug) {
    try {
      ;(await cookies()).set(METRO_COOKIE, metroSlug, { path: '/', maxAge: METRO_COOKIE_MAX_AGE, sameSite: 'lax' })
      const supabase = await createClient()
      const { data } = await supabase.auth.getUser()
      if (data.user) {
        await memberDefaultMetroSet(resolveActionContext({ actingMemberId: data.user.id }), { metroId: snapshot.metro.id })
      }
    } catch (error) {
      console.error('[browseFeedAction] metro not remembered:', (error as Error).message)
    }
  }
  return snapshot
}

/** #796 — what Explore's first look showed, so it does not lead again on a later visit. */
export async function markLeadSeenAction(keys: string[]): Promise<void> {
  const seed = await readSessionSeed()
  if (!seed || !Array.isArray(keys)) return
  const store = await cookies()
  const value = recordSeen(store.get(SEEN_COOKIE)?.value, seed, keys.slice(0, 12).map(String))
  store.set(SEEN_COOKIE, value, { path: '/', maxAge: SEEN_COOKIE_MAX_AGE, sameSite: 'lax', httpOnly: true })
}

/** #549 — the pins, fetched by the surface once the list is up. */
export async function browseMapAction(metroId: string, areaId: string | null): Promise<MixedResult[]> {
  return loadMemberMap(metroId, areaId)
}

/** Type-to-search neighbourhoods. Empty when there are none to offer. */
export async function searchAreasAction(query: string): Promise<{ id: string; name: string }[]> {
  if (!query.trim()) return []
  try {
    const rows = await withTransaction((client) => searchNeighborhoods(client, query))
    return rows.map((r) => ({ id: r.placeId, name: r.name }))
  } catch (error) {
    console.error('[searchAreasAction] failed:', (error as Error).message)
    return []
  }
}

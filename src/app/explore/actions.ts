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
import { UNKNOWN_ZIP } from '@/actions/member/zip-set'
import { METRO_COOKIE, METRO_COOKIE_MAX_AGE } from '@/lib/browse/remembered-metro'
import { withTransaction } from '@/actions/_lib/db'
import { searchNeighborhoods } from '@/lib/places/neighborhood-search'
import { loadBrowse, loadMemberMap, readSessionSeed, type BrowseSnapshot } from './load'
import { SEEN_COOKIE, SEEN_COOKIE_MAX_AGE, recordSeen } from '@/lib/browse/lead'
import type { MixedResult } from '@/lib/map/mix'
import type { BrowseFilters } from '@/lib/browse/filters'
import { parseReach, type Reach } from '@/lib/browse/reach'
import { hasBrowseFilters } from '@/lib/browse/filters'
import { countUse } from '@/lib/usage/count-use'
import { ZIP_COOKIE, ZIP_COOKIE_MAX_AGE, isZip, readZipCookie, zipCookieValue } from '@/lib/browse/visitor-zip'
import { marketForZip } from '@/lib/signup/zip-market'

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
  // F133 — a search or a filter is a use of search, counted after the response.
  if ((search ?? '').trim() || (filters && hasBrowseFilters(filters))) await countUse({ part: 'search' })
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
  // F133 — opening the map is a use of the map, counted after the response.
  await countUse({ part: 'map' })
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

/**
 * F081 (the PM, 2026-11-25) — a visitor names their area by zip. The zip decides the market the way it does at
 * signup (zip → county → market, `marketForZip`); it is kept on this device so they need not type it again, and
 * Explore then reads that market. A member's zip is changed on /you, never here.
 * Failures come back as data: a thrown message does not survive the server-action boundary.
 */
export async function setVisitorZipAction(
  zip: string,
): Promise<{ ok: true; snapshot: BrowseSnapshot } | { ok: false; message: string }> {
  const z = String(zip ?? '').trim()
  // Draft copy (human-review).
  if (!isZip(z)) return { ok: false, message: 'A zip is five numbers.' }
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user) return { ok: false, message: 'Change your zip on You.' }
  const market = await marketForZip(supabase, z)
  // The ruled words (F081, 2026-09-30), the same as signup and You.
  if (!market) return { ok: false, message: UNKNOWN_ZIP }
  const { data: row } = await supabase.from('metro_polygons').select('slug').eq('id', market.metroId).maybeSingle()
  const slug = (row as { slug: string } | null)?.slug
  if (!slug) return { ok: false, message: 'That didn’t go through. Mind trying again?' }
  const jar = await cookies()
  jar.set(ZIP_COOKIE, zipCookieValue(z, slug), { path: '/', maxAge: ZIP_COOKIE_MAX_AGE, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' })
  jar.set(METRO_COOKIE, slug, { path: '/', maxAge: METRO_COOKIE_MAX_AGE, sameSite: 'lax' })
  return { ok: true, snapshot: await loadBrowse(slug, null, { withMap: false, seed: await readSessionSeed() }) }
}

/** F081 — the easy opt-out: forget this visitor's zip on this device, and the market it set if that is still the one. */
export async function forgetVisitorZipAction(): Promise<BrowseSnapshot> {
  const jar = await cookies()
  const given = readZipCookie(jar.get(ZIP_COOKIE)?.value)
  jar.delete({ name: ZIP_COOKIE, path: '/' })
  // The market the zip set goes with it; an area the visitor picked since is theirs and stays.
  if (given && jar.get(METRO_COOKIE)?.value === given.slug) jar.delete({ name: METRO_COOKIE, path: '/' })
  return loadBrowse(null, null, { withMap: false, seed: await readSessionSeed() })
}

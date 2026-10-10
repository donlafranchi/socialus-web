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
import type { MixedResult } from '@/lib/map/mix'

export async function browseFeedAction(metroSlug: string | null, areaId: string | null = null): Promise<BrowseSnapshot> {
  const snapshot = await loadBrowse(metroSlug, areaId, { withMap: false, seed: await readSessionSeed() })
  if (metroSlug && snapshot.metro?.slug === metroSlug) {
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

/** #549 — the pins, fetched by the surface once the list is up. */
export async function browseMapAction(metroId: string, areaId: string | null): Promise<MixedResult[]> {
  return loadMemberMap(metroId, areaId)
}

/** The You page's "default metro". Only a metro the platform is running can be the default. */
export async function saveDefaultMetroAction(slug: string): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { ok: false }
  const { data: metro } = await supabase
    .from('metro_polygons')
    .select('id, slug')
    .eq('slug', slug)
    .eq('is_open', true)
    .maybeSingle()
  const row = metro as { id: string; slug: string } | null
  if (!row) return { ok: false }
  try {
    await memberDefaultMetroSet(resolveActionContext({ actingMemberId: data.user.id }), { metroId: row.id })
  } catch (error) {
    console.error('[saveDefaultMetroAction] not saved:', (error as Error).message)
    return { ok: false }
  }
  ;(await cookies()).set(METRO_COOKIE, row.slug, { path: '/', maxAge: METRO_COOKIE_MAX_AGE, sameSite: 'lax' })
  return { ok: true }
}

// #476 — neighbourhood boundaries are loaded per MSA (#347); Sacramento's is the
// only one loaded, so it is the only metro with a neighbourhood list.
const METRO_MSA: Record<string, string> = { 'sacramento-roseville-ca': '40900' }

/** Type-to-search neighbourhoods in the current metro. Empty when there are none to offer. */
export async function searchAreasAction(metroSlug: string, query: string): Promise<{ id: string; name: string }[]> {
  const msa = METRO_MSA[metroSlug]
  if (!msa || !query.trim()) return []
  try {
    const rows = await withTransaction((client) => searchNeighborhoods(client, query, msa))
    return rows.map((r) => ({ id: r.placeId, name: r.name }))
  } catch (error) {
    console.error('[searchAreasAction] failed:', (error as Error).message)
    return []
  }
}

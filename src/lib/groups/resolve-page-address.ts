// Resolving a Page at its address. #1139 (Don, 2026-11-01; replaces #411's id-only ruling): the readable address
// /<place>-<st>/<page-slug> is the Page's; /g/<id> still resolves, for a draft (which has no readable address yet)
// and as what the proxy forwards to the readable one.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveShop, type ResolvedShop } from './resolve-shop'
import { isPageId, isPlaceSegment, isSlugSegment } from './page-handle'

/** The Page at /g/<id>, or null. A dissolved Page has no address. */
export async function resolvePageById(supabase: SupabaseClient, id: string): Promise<ResolvedShop | null> {
  if (!isPageId(id)) return null
  const shop = await resolveShop(supabase, id, { by: 'publicId' })
  if (!shop || shop.lifecycleState === 'dissolved') return null
  return shop
}

/** The Page at /<place>/<page>, or null, without a read for a segment the database would never mint. */
export async function resolvePageByAddress(supabase: SupabaseClient, place: string, page: string): Promise<ResolvedShop | null> {
  if (!isPlaceSegment(place) || !isSlugSegment(page)) return null
  const shop = await resolveShop(supabase, `${place}/${page}`, { by: 'address' })
  if (!shop || shop.lifecycleState === 'dissolved') return null
  return shop
}

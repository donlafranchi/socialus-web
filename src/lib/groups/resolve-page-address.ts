// Resolving a Page at its address. #411 (the PM, 2026-10-06; socialus-plan
// planning/research/url-plan-2026-10-06.md): /g/<id> is the only Page address.
// The id resolves; nothing else does. There are no members or shared links
// yet, so older forms (/g/<name>-<id>, /g/<slug>, /p/<place>/g/<slug>) are not
// forwarded; they are not found. Revisit forwarding once real members exist.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveShop, type ResolvedShop } from './resolve-shop'
import { isPageId } from './page-handle'

/** The Page at /g/<id>, or null. Only the id as minted resolves (#411); a
 *  dissolved Page has no address. Checked here so every route gets one answer. */
export async function resolvePageById(supabase: SupabaseClient, id: string): Promise<ResolvedShop | null> {
  if (!isPageId(id)) return null
  const shop = await resolveShop(supabase, id, { by: 'publicId' })
  if (!shop || shop.lifecycleState === 'dissolved') return null
  return shop
}

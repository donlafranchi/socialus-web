// Issue #175 — resolving a Page at its canonical address.
//
// Ruling: ops-pattern planning/URL-IDENTITY.md (Don, 2026-09-21). Two rules
// live here, and neither is optional.
//
//   THE ID RESOLVES, THE SLUG DOES NOT. A Page is found by `public_id`. The
//   slug in front of it is read for display and ignored for lookup, which is
//   what lets a Page be renamed without breaking a link somebody already sent.
//
//   ONE ADDRESS, EVERY OTHER SHAPE REDIRECTS. An address that is not the
//   canonical one is never served as a second copy of the Page. That is the
//   defect already on this issue — /p/ca/sacramento/g/mayas-bakery and
//   /p/ny/albany/g/mayas-bakery rendering the same Page, neither canonical —
//   and it is why this returns a redirect rather than just a Page.
//
// THE FALLBACK IS NOT LEGACY SUPPORT, it is an ambiguity in the scheme itself.
// `mayas-bakery` splits as slug `mayas` plus id `bakery`, because `bakery` is
// six characters and every one of them is in the alphabet. No parser can tell
// that from a real handle; only a lookup can. So: try the id, and if nothing
// has it, try the whole handle as a slug. That same fallback is what carries
// every address shared before this shipped.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveShop, type ResolvedShop } from './resolve-shop'
import { parsePageHandle, canonicalPagePath } from './page-handle'

export interface ResolvedPageAddress {
  shop: ResolvedShop
  /** Non-null means this address is not the canonical one: redirect there,
   *  permanently, instead of rendering. */
  redirectTo: string | null
}

export async function resolvePageByHandle(
  supabase: SupabaseClient,
  handle: string,
): Promise<ResolvedPageAddress | null> {
  const parsed = parsePageHandle(handle)

  let shop: ResolvedShop | null = null
  if (parsed) {
    shop = await resolveShop(supabase, parsed.publicId, { by: 'publicId' })
  }
  // Nothing carries that id — so either the tail was never an id, or it is a
  // slug that happens to look like one. Either way the whole handle is the
  // only other thing it can be.
  if (!shop) {
    shop = await resolveShop(supabase, handle.trim().toLowerCase(), {})
  }
  if (!shop) return null

  // A dissolved Page has no address. Checked here rather than in every route,
  // so there is one answer to it.
  if (shop.lifecycleState === 'dissolved') return null

  const canonical = canonicalPagePath(shop.publicId)
  return {
    shop,
    redirectTo: `/g/${handle}` === canonical ? null : canonical,
  }
}

// T156 — the metro Browse is reading, and whether anybody chose it.
//
// `resolveFeedMetro` answers WHICH metro. It cannot answer whether a person
// picked it, because it returns the same row whichever of its three branches
// won. The location pill needs the second answer: it says "Choose your area"
// rather than naming a locality nobody named, which is the rule `place-label`
// exists to enforce.
//
// `chosen` is the same two-clause test `explore/origin.ts` used before this
// replaced it, and for the same reason. A stored home metro is DERIVED —
// `resolve_home_metro(primary_home.centroid)`, migration 031 — and onboarding
// writes the launch Place into every new Member invisibly. So a stored metro
// equal to the seeded default is nobody's choice, and naming it would be the
// same lie by a longer route.

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_METRO_SLUG, resolveFeedMetro, type FeedMetro } from '@/lib/feed/feed-metro'

type FromClient = Pick<SupabaseClient, 'from'>

export interface BrowseScope {
  metro: FeedMetro
  /** Did a person actually pick this metro? Drives the pill's wording. */
  chosen: boolean
}

export async function resolveBrowseScope(
  supabase: FromClient,
  opts: {
    memberMetroId?: string | null
    /** The member's own "default metro" setting (You page). Beats the zip-derived one. */
    memberDefaultMetroId?: string | null
    requestedSlug?: string | null
    /** Last metro picked on this device (cookie). Used when nothing is requested. */
    rememberedSlug?: string | null
  },
): Promise<BrowseScope | null> {
  const requested = opts.requestedSlug?.trim() || opts.rememberedSlug?.trim() || null
  const memberMetroId = opts.memberDefaultMetroId ?? opts.memberMetroId
  const metro = await resolveFeedMetro(supabase, { memberMetroId, requestedSlug: requested })
  if (!metro) return null

  if (requested && metro.slug === requested) return { metro, chosen: true }

  const stored = memberMetroId && metro.id === memberMetroId
  const picked = Boolean(opts.memberDefaultMetroId) && metro.id === opts.memberDefaultMetroId
  return { metro, chosen: picked || (Boolean(stored) && metro.slug !== DEFAULT_METRO_SLUG) }
}

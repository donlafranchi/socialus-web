// T156 — the metro Browse is reading, and whether anybody chose it.
//
// `chosen` drives the location pill's wording: it names a locality only when a person named it. A stored home
// metro is DERIVED (migration 031) and onboarding wrote the launch Place into early Members invisibly, so a stored
// metro equal to the launch market is nobody's choice.
//
// F081 ruling 2026-11-25 (the PM) replaces the silent default: someone with no market of their own is admitted to
// the open market within an hour of where they are, chooses between several, or is sent to the waitlist
// (`@/lib/metro/admission`). With nothing to go on, F059 criterion 6: the one open market while exactly one is open.

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_METRO_SLUG, resolveFeedMetro, type FeedMetro } from '@/lib/feed/feed-metro'
import type { Admission } from '@/lib/metro/admission'

type FromClient = Pick<SupabaseClient, 'from'>

export interface BrowseScope {
  metro: FeedMetro
  /** Did a person actually pick this metro? Drives the pill's wording. */
  chosen: boolean
  /** F081 (2026-11-25) — nobody picked it; they were admitted because it is within an hour of them. */
  admitted?: true
}

/** Why there is no scope: the visitor chooses between nearby markets, or none is near. */
export type ScopePrompt = { kind: 'choose'; among: FeedMetro[] } | { kind: 'far' }

export async function resolveBrowseScope(
  supabase: FromClient,
  opts: {
    memberMetroId?: string | null
    /** The member's own "default metro" setting (You page). Beats the zip-derived one. */
    memberDefaultMetroId?: string | null
    requestedSlug?: string | null
    /** Last metro picked on this device (cookie). Used when nothing is requested. */
    rememberedSlug?: string | null
    /** #978 — every metro, already read: the scope is picked from it with no read of its own. */
    catalog?: readonly FeedMetro[]
    /** F081 — where the visitor is admitted, for someone with no market of their own. Absent: the old default. */
    admission?: Admission
  },
): Promise<BrowseScope | null> {
  const requested = opts.requestedSlug?.trim() || opts.rememberedSlug?.trim() || null
  const memberMetroId = opts.memberDefaultMetroId ?? opts.memberMetroId

  // A person's own market: a tapped switcher or shared link, then their setting, then their zip's market.
  const own = opts.catalog?.length
    ? (requested ? opts.catalog.find((m) => m.slug === requested) : undefined) ??
      (memberMetroId ? opts.catalog.find((m) => m.id === memberMetroId) : undefined) ??
      null
    : null
  if (own) {
    if (requested && own.slug === requested) return { metro: own, chosen: true }
    const picked = Boolean(opts.memberDefaultMetroId) && own.id === opts.memberDefaultMetroId
    return { metro: own, chosen: picked || own.slug !== DEFAULT_METRO_SLUG }
  }

  if (opts.catalog?.length && opts.admission) {
    const a = opts.admission
    if (a.kind === 'one') return { metro: a.metro, chosen: false, admitted: true }
    if (a.kind === 'unknown') {
      const open = opts.catalog.filter((m) => m.isOpen)
      return open.length === 1 ? { metro: open[0]!, chosen: false } : null
    }
    return null
  }

  // No catalog in hand (its read failed), or a caller that does not admit: the old precedence and default.
  const metro = await resolveFeedMetro(supabase, { memberMetroId, requestedSlug: requested })
  if (!metro) return null
  if (requested && metro.slug === requested) return { metro, chosen: true }
  const stored = memberMetroId && metro.id === memberMetroId
  const picked = Boolean(opts.memberDefaultMetroId) && metro.id === opts.memberDefaultMetroId
  return { metro, chosen: picked || (Boolean(stored) && metro.slug !== DEFAULT_METRO_SLUG) }
}

/** What a visitor with no scope is asked: choose between the markets near them, or none is near. */
export function scopePrompt(admission: Admission | undefined): ScopePrompt | null {
  if (admission?.kind === 'several') return { kind: 'choose', among: admission.metros }
  if (admission?.kind === 'far') return { kind: 'far' }
  return null
}

// The Pages a member made, shown back to them.
//
// Don created "SacRiver Floaters" and "Stare at the stars" on 2026-09-16, both
// active and listed with a real anchor location, and could not see either one
// anywhere in the product. Not a regression — no surface has ever listed a
// member's own Pages. `SellCta` calls `getDraftGroup`, which finds a DRAFT to
// resume and lets an active Page fall straight through it.
//
// Reads `founder_member_id`, not `group_memberships`: the founder is the one
// who made the thing, and that is who this list is for. A co-steward seeing it
// under "yours" is a different question.
//
// Drafts are included deliberately. RLS (`groups_select_active_or_own_draft`)
// already admits a founder's own draft, and a member whose half-finished Page
// vanished until they published it would be back in exactly the situation this
// fixes.

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchGroupPrefixes } from '@/lib/feed/group-prefixes'
import { visiblePhotoUrl } from '@/lib/groups/visible-photo-url'
import type { CardLocation } from '@/components/cards'

export interface OwnPage {
  groupId: string
  name: string
  slug: string | null
  kind: string
  category: string | null
  description: string | null
  photoUrl: string | null
  location: CardLocation
  /** 'draft' | 'active' | 'dissolved' — shown, because a draft looks identical otherwise. */
  lifecycleState: string
  /** Null for a draft, or when the place path cannot be resolved. */
  href: string | null
}

interface Row {
  id: string
  name: string | null
  slug: string | null
  kind: string
  category: string | null
  description: string | null
  photo_url: string | null
  photo_hidden_at: string | null
  lifecycle_state: string
  anchor: { label: string | null; kind: string | null } | null
}

const SELECT =
  'id, name, slug, kind, category, description, photo_url, photo_hidden_at, lifecycle_state,' +
  ' anchor:locations!groups_anchor_location_id_fkey(label, kind)'

/**
 * A Location's own kind decides the scale, rather than this guessing.
 *
 * `locations.kind` is `permanent | recurring_temporary | area` (migration 007).
 * A permanent place is an address; an area is a neighbourhood. A Page with no
 * anchor at all is `none` — "not chosen yet" — which is a different fact from
 * `online`, and saying online about a half-finished draft would be a lie the
 * owner never told.
 */
function scaleFor(anchor: Row['anchor']): CardLocation {
  if (!anchor) return { scale: 'none' }
  const label = anchor.label?.trim() || null
  if (anchor.kind === 'area') return { scale: 'neighbourhood', label }
  return { scale: 'address', label }
}

export async function getOwnPages(
  supabase: Pick<SupabaseClient, 'from' | 'rpc'>,
  memberId: string,
): Promise<OwnPage[]> {
  const { data, error } = await supabase
    .from('groups')
    .select(SELECT)
    .eq('founder_member_id', memberId)
    .is('dissolved_at', null)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) {
    // Loud. The whole bug this fixes was a member's own work being invisible
    // with nothing saying why.
    console.error('[getOwnPages] query failed:', error.message)
    return []
  }

  const rows = (data ?? []) as unknown as Row[]

  // Only an active Page has a public URL worth offering. A draft's link would
  // 404 for its own author, which is a worse answer than no link.
  const active = rows.filter((r) => r.lifecycle_state === 'active')
  const prefixes = await fetchGroupPrefixes(supabase, active.map((r) => r.id))

  return rows.map((r) => {
    const prefix = r.lifecycle_state === 'active' ? prefixes.get(r.id) : undefined
    return {
      groupId: r.id,
      name: r.name ?? 'Untitled',
      slug: r.slug,
      kind: r.kind,
      category: r.category,
      description: r.description,
      photoUrl: visiblePhotoUrl({ photo_url: r.photo_url, photo_hidden_at: r.photo_hidden_at }),
      location: scaleFor(r.anchor),
      lifecycleState: r.lifecycle_state,
      href: prefix ? `/p/${prefix.placePath}/g/${prefix.slug}` : null,
    }
  })
}

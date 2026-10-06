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
import { canonicalPagePath } from '@/lib/groups/page-handle'
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
  /** 'draft' | 'active' | 'archived' | 'dissolved' — shown, because a draft looks identical otherwise. */
  lifecycleState: string
  /** #423 — a deleted Page's removal date (ISO); null otherwise. */
  deleteAfter: string | null
  /** The canonical address. Every Page has one, including a draft, whose owner
   *  previews it at the address it will keep. Null only for a deleted Page,
   *  whose address answers nobody. */
  href: string | null
}

interface Row {
  id: string
  name: string | null
  slug: string | null
  public_id: string
  kind: string
  category: string | null
  description: string | null
  photo_url: string | null
  photo_hidden_at: string | null
  lifecycle_state: string
  delete_after?: string | null
  anchor: { label: string | null; kind: string | null } | null
}

const SELECT =
  'id, name, slug, public_id, kind, category, description, photo_url, photo_hidden_at, lifecycle_state, delete_after,' +
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
  now: Date = new Date(),
): Promise<OwnPage[]> {
  // #253 — groups.founder_member_id answers nobody; the founder's own ids come
  // from a function that reads it as them.
  void memberId
  const { data: ids } = await supabase.rpc('current_member_founded_group_ids')
  const { data, error } = await supabase
    .from('groups')
    .select(SELECT)
    .in('id', (ids as string[] | null) ?? [])
    // #423 — a deleted Page stays here, to restore, until its delete_after.
    .or('dissolved_at.is.null,delete_after.not.is.null')
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) {
    // Loud. The whole bug this fixes was a member's own work being invisible
    // with nothing saying why.
    console.error('[getOwnPages] query failed:', error.message)
    return []
  }

  const rows = ((data ?? []) as unknown as Row[]).filter(
    (r) => r.lifecycle_state !== 'dissolved' || (r.delete_after != null && new Date(r.delete_after) > now),
  )

  // Issue #175 — every Page here links, including a draft.
  //
  // This used to resolve a place path and hand back `href: null` when it could
  // not, which was always, because nothing populates `locations.place_id` for
  // a member-created Location. Don saw two Pages he had made and neither was
  // clickable — and the owner bar, which is the only way to edit a Page or
  // announce anything, lives ON the Page. A dead card here was a dead creator
  // surface.
  //
  // A draft links too. Its address is the one it keeps when it goes live, and
  // RLS already admits a founder to their own draft, so the link resolves for
  // the one person who can see it.
  return rows.map((r) => {
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
      deleteAfter: r.delete_after ?? null,
      href: r.lifecycle_state === 'dissolved' ? null : canonicalPagePath(r.slug ?? 'page', r.public_id),
    }
  })
}

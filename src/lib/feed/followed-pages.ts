// T156 — the "get updates from" set.
//
// Browse carries a signed-in person's own announcements and upcoming things,
// and signed out that half is absent — **server-side, never rendered and
// hidden** (Don, 2026-09-17; F059 criteria 2b/2c). This resolves the set the
// query withholds on.
//
// THE LINK IS THE EXISTING ONE. `src/ontology/links.ts` already declares *a
// Member is subscribed to a Page's updates*, carried by
// `group_memberships.relationship` and written by `group.follow` /
// `group.unfollow` (ruled 2026-09-17). Nothing new is introduced here, so
// nothing in that file changes — this only reads what it names.
//
// BOTH RELATIONSHIPS COUNT. Privacy decides which word gets written (Don,
// 2026-09-15): a private Page is joined as a member, anything else is
// followed. Both are subscriptions to that Page's updates, and a member of a
// private Page who stopped receiving its announcements because the column said
// 'member' would be a bug with no visible cause.
//
// Reads through `memberships_select_self`, which returns a member their own
// rows whatever the relationship — so this needs no elevated rights and can
// see nobody else's.

import type { SupabaseClient } from '@supabase/supabase-js'

type FromClient = Pick<SupabaseClient, 'from'>

/** The relationships that mean "send me this Page's updates". */
export const SUBSCRIBED_RELATIONSHIPS = ['follower', 'member'] as const

/**
 * The Pages this member gets updates from.
 *
 * Signed out (`memberId` null) returns an empty set without a query: there is
 * no member, so there is no set, and the caller's next move is the same either
 * way — the personal half of Browse returns nothing.
 *
 * Throws on a read error. An empty set and a failed read look identical to
 * every surface downstream, both showing no personal content, so the failure
 * has to be loud at the point it happens.
 */
export async function resolveFollowedPageIds(
  supabase: FromClient,
  memberId: string | null,
): Promise<string[]> {
  if (!memberId) return []
  const { data, error } = await supabase
    .from('group_memberships')
    .select('group_id')
    .eq('member_id', memberId)
    .is('left_at', null)
    .in('relationship', [...SUBSCRIBED_RELATIONSHIPS])
  if (error) throw error
  return Array.from(new Set(((data ?? []) as { group_id: string }[]).map((r) => r.group_id)))
}

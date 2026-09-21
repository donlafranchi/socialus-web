// How many people get updates from a Page.
//
// F072 criterion 4 — the count beside the restricted audience setting. A COUNT
// AND NEVER A ROSTER: Don, 2026-09-07, a count is shown to the Page owner,
// never a roster of who reacted. The open question in verbs.md about whether a
// Page owner may see WHO their audience is stays open, and a count does not
// answer it.
//
// `head: true` is not a performance nicety here, it is the rule in code: this
// read cannot return a row even if someone later wants one.
//
// RLS is the boundary, not this. `memberships_select_listed_group` excludes
// followers except for whoever runs the Page (ruled 2026-09-15), so a
// non-owner asking this gets zero — which is also why the composer only ever
// shows it to the owner.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function countPageFollowers(
  supabase: Pick<SupabaseClient, 'from'>,
  groupId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('group_memberships')
    .select('group_id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .eq('relationship', 'follower')
    .is('left_at', null)
  // A failed count is not zero people — but "Nobody yet" is the only honest
  // thing to render without a number, and the setting it sits under cannot be
  // posted with anyway.
  if (error) return 0
  return count ?? 0
}

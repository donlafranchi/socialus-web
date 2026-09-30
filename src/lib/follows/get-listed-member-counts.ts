// T109 — Listed-member-count reader for Group rows (F042).
//
// Counts LISTED memberships per Group: active explicit memberships in
// non-dissolved, listed Groups, so the count surfaced on /you/following can
// never exceed the public count. #246 — through page_listed_member_counts,
// which returns a number per Page and never the members behind it.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function getListedMemberCounts(
  supabase: SupabaseClient,
  groupIds: string[],
): Promise<Record<string, number>> {
  if (groupIds.length === 0) return {}

  const { data } = await supabase.rpc('page_listed_member_counts', { p_group_ids: groupIds })

  const counts: Record<string, number> = {}
  for (const row of (data as { group_id: string; members: number }[] | null) ?? []) {
    counts[row.group_id] = row.members
  }
  return counts
}

// Seller signal — "does this Member run a Shop?"
//
// Trace: planning/backlog/audit-vendor-market-retirement.md § 1.3
// The nav CTA used to answer this by reading `businesses`, a pre-rebuild table
// that no longer exists; the query failed silently and the CTA showed to
// everyone. The current model answers it with an active kind='business' Group
// membership — the first clause of the "Seller" definition in CLAUDE.md
// § Naming conventions rule 4.
//
// Same query shape as lib/sell/getDraftGroup.ts branch 1, kept separate so the
// nav does not pull the walkthrough's draft lookup. Supabase-client-shaped so
// it runs from a server or browser component; RLS does the auth filtering.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function hasActiveBusinessGroup(
  supabase: SupabaseClient,
  memberId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('group_memberships')
    .select('group_id, groups!inner(kind, lifecycle_state)')
    .eq('member_id', memberId)
    .is('left_at', null)
    .eq('groups.kind', 'business')
    .eq('groups.lifecycle_state', 'active')
    .limit(1)

  // Throw rather than return false: callers gate a "start selling" CTA on
  // this, and a swallowed error is what produced the bug in the first place.
  if (error) {
    throw new Error(`hasActiveBusinessGroup: failed to read memberships: ${error.message}`)
  }
  return (data ?? []).length > 0
}

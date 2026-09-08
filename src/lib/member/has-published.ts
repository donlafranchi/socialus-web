// T137 — Findability follows what you've published.
// One derivation, four readers (product / service / gathering / shop resolvers).
// Reads the anon-readable projection from migration 038; never the opt-in flag.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function memberHasPublished(
  supabase: SupabaseClient,
  memberId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_public_has_published')
    .select('member_id')
    .eq('member_id', memberId)
    .maybeSingle()
  return !error && data !== null
}

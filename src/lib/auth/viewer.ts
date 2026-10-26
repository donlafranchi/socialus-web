// #791 — who is signed in, from the session token, verified here against the
// project's published signing key (ES256) — Supabase's recommended server check.
// `getUser()` asked the auth server instead: a network round trip in front of
// every read on every signed-in tap. RLS verifies the same token on each query.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function viewerId(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getClaims()
    const sub = error ? null : data?.claims?.sub
    return typeof sub === 'string' && sub ? sub : null
  } catch {
    return null
  }
}

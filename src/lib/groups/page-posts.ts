// F072 — the posts a Page shows, newest first.
//
// RLS does the visibility work. `page_posts_select_published` returns live,
// listed posts of live, listed Pages; `page_posts_select_own` additionally
// returns the founder their own. So this asks for no state filter of its own —
// adding one would be a second answer to "what is visible", and the two would
// drift.
//
// Supabase-client-shaped so it runs from the server component that renders the
// Page, the same convention resolveShopItems() follows.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PagePost {
  id: string
  body: string
  createdAt: string
  updatedAt: string
}

interface Row {
  id: string
  body: string
  created_at: string
  updated_at: string
}

/** Ordered by recency, matching browse. A read failure yields no posts rather
 *  than an error page: a Page whose posts cannot be read is still a Page. */
export async function resolvePagePosts(
  supabase: SupabaseClient,
  groupId: string,
): Promise<PagePost[]> {
  const { data, error } = await supabase
    .from('page_posts')
    .select('id, body, created_at, updated_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error || !data) return []
  return (data as Row[]).map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

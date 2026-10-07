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

import { maskEmails, maskEmailsOrNull } from '@/lib/text/contact-info'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PagePost {
  id: string
  body: string
  createdAt: string
  updatedAt: string
  /** F072 — when it is. Null means undated, which is a first-class
   *  announcement and not a degraded event. */
  startsAt: string | null
  /** #262 — optional, after the start. */
  endsAt?: string | null
  /** F072 — where it is, in its own words. Null means at its Page's address;
   *  an announcement never borrows its Page's pin, but it does inherit its
   *  Page's whereabouts when it says nothing. */
  locationLabel: string | null
  /** #348 — an event's own meet spot, beside its place. */
  howToFind?: string | null
  /** #286 — the post's own tags; empty means it carries its Page's. */
  tags?: string[]
}

interface Row {
  id: string
  body: string
  created_at: string
  updated_at: string
  starts_at: string | null
  ends_at: string | null
  how_to_find?: string | null
  location: { label: string | null } | { label: string | null }[] | null
  post_tags?: { tags: { label: string } | { label: string }[] | null }[] | null
}

/** Ordered by recency, matching browse. A read failure yields no posts rather
 *  than an error page: a Page whose posts cannot be read is still a Page. */
export async function resolvePagePosts(
  supabase: SupabaseClient,
  groupId: string,
): Promise<PagePost[]> {
  const { data, error } = await supabase
    .from('page_posts')
    .select('id, body, created_at, updated_at, starts_at, ends_at, how_to_find, location:locations(label), post_tags(tags(label))')
    .eq('group_id', groupId)
    // #461 — deleted is gone, for the owner too (page_posts_select_own reads it).
    .is('dissolved_at', null)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error || !data) return []
  return (data as Row[]).map((r) => {
    // PostgREST returns an embedded relation as an array or an object
    // depending on cardinality hints. Normalise to the first row, the same way
    // resolveShop does.
    const loc = Array.isArray(r.location) ? r.location[0] : r.location
    return {
      id: r.id,
      body: maskEmails(r.body),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      tags: (r.post_tags ?? [])
        .map((t) => (Array.isArray(t.tags) ? t.tags[0] : t.tags)?.label)
        .filter((l): l is string => Boolean(l)),
      locationLabel: loc?.label ?? null,
      howToFind: maskEmailsOrNull(r.how_to_find ?? null),
    }
  })
}

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
import { visiblePhotoUrl } from '@/lib/groups/visible-photo-url'
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
  /** #314 — the day an undated post shows through, when its owner picked one; null is 14 days after posting. */
  showUntil?: string | null
  /** F072 — where it is, in its own words. Null means at its Page's address;
   *  an announcement never borrows its Page's pin, but it does inherit its
   *  Page's whereabouts when it says nothing. */
  locationLabel: string | null
  /** #348 — an event's own meet spot, beside its place. */
  howToFind?: string | null
  /** #286 — the post's own tags; empty means it carries its Page's. */
  tags?: string[]
  /** F099 — the post's own photo, only when it is neither hidden nor removed.
   *  Resolved here, on the server, so a hidden URL never reaches a browser. */
  photoUrl?: string | null
  /** F099 — the photo exists and is hidden pending review (not removed): the poster's notice, nothing else. */
  photoHidden?: boolean
  /** F078 — set while a report has it down; only the people who manage the Page can still read it. */
  hiddenAt?: string | null
  /** #796 — a seeder sample (#556), marked as one wherever it shows. */
  sampleKind?: 'event' | 'deal' | 'last_minute' | null
  /** F074 / #945 — the weekly series this post is an occurrence of, if any. */
  seriesId?: string | null
  /** #997 — a show imported from a venue's own calendar, and its own ticket link. */
  eventKey?: string | null
  ticketUrl?: string | null
  /** F117 — a Wonder: who's in toward a threshold, with optional sizes. Absent on an announcement. */
  wonder?: { threshold: number; options: string[] } | null
  /** #913 — false once the database's post_current_until has passed; an undated one then sits under Earlier. */
  current?: boolean
}

interface Row {
  id: string
  body: string
  created_at: string
  updated_at: string
  starts_at: string | null
  ends_at: string | null
  show_until?: string | null
  how_to_find?: string | null
  photo_url?: string | null
  photo_hidden_at?: string | null
  photo_removed_at?: string | null
  hidden_at?: string | null
  sample_kind?: 'event' | 'deal' | 'last_minute' | null
  series_id?: string | null
  event_key?: string | null
  ticket_url?: string | null
  current_until?: string | null
  kind?: string | null
  wonder_threshold?: number | null
  wonder_options?: string[] | null
  location: { label: string | null } | { label: string | null }[] | null
  post_tags?: { tags: { label: string } | { label: string }[] | null }[] | null
}

/** Ordered by recency, matching browse. A read failure yields no posts rather
 *  than an error page: a Page whose posts cannot be read is still a Page. */
export async function resolvePagePosts(
  supabase: SupabaseClient,
  groupId: string,
  now: Date = new Date(),
): Promise<PagePost[]> {
  const { data, error } = await supabase
    .from('page_posts')
    .select('id, body, created_at, updated_at, starts_at, ends_at, show_until, how_to_find, photo_url, photo_hidden_at, photo_removed_at, hidden_at, sample_kind, series_id, event_key, ticket_url, current_until, kind, wonder_threshold, wonder_options, location:locations(label), post_tags(tags(label))')
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
      showUntil: r.show_until ?? null,
      tags: (r.post_tags ?? [])
        .map((t) => (Array.isArray(t.tags) ? t.tags[0] : t.tags)?.label)
        .filter((l): l is string => Boolean(l)),
      locationLabel: loc?.label ?? null,
      howToFind: maskEmailsOrNull(r.how_to_find ?? null),
      photoHidden: !!r.photo_url && !!r.photo_hidden_at && !r.photo_removed_at,
      photoUrl: visiblePhotoUrl({
        photo_url: r.photo_url ?? null,
        photo_hidden_at: r.photo_hidden_at ?? null,
        photo_removed_at: r.photo_removed_at ?? null,
      }),
      hiddenAt: r.hidden_at ?? null,
      sampleKind: r.sample_kind ?? null,
      seriesId: r.series_id ?? null,
      eventKey: r.event_key ?? null,
      ticketUrl: r.ticket_url ?? null,
      ...(r.kind === 'wonder' && r.wonder_threshold ? { wonder: { threshold: r.wonder_threshold, options: r.wonder_options ?? [] } } : {}),
      current: !r.current_until || new Date(r.current_until).getTime() >= now.getTime(),
    }
  })
}

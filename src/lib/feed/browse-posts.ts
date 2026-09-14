// T162 (#75) — post-grain browse read helper.
//
// The twin of getBrowsePages, and deliberately the same shape: Browse reads
// Pages and posts, and the two sources should not need two mental models.
// Supabase-client-shaped (calls the browse_posts RPC) so it runs from a server
// component with the session-bound or anon client.
//
// Where it differs from the Page-grain helper, the difference is the ticket:
//
//   * `body` — the post's own free text, which is what typed search narrows on.
//   * `startsAt` — OPTIONAL. Null means undated, and an undated post is a
//     first-class post rather than a degraded event. Never a sentinel date:
//     a sentinel would sort and filter as though the post had a time.
//   * the geography is the POST's own, null when it has no address of its own.
//     A post does not borrow its Page's pin — what a map does with an
//     addressless post is #53's call, and this helper does not pre-empt it.
//
// This is Browse's read, not Home's. Browse is complete and is NOT ranked by
// the member's declared interests (ruled 2026-09-12), which is why there is no
// tag parameter here and no boost in the function. There is no category
// parameter either: categories are retired and tags are the only vocabulary
// (ruled 2026-09-13).

import type { SupabaseClient } from '@supabase/supabase-js'
import { decodeEwkbPoint } from '@/lib/explore/ewkb'
import { attachGroupPrefixes } from './group-prefixes'
import { clampLimit } from './locality-feed'

/** One row exactly as `browse_posts` returns it. */
export interface BrowsePostRow {
  post_id: string
  group_id: string
  slug: string
  name: string
  photo_url: string | null
  body: string
  starts_at: string | null
  location_id: string | null
  location_label: string | null
  location_geography: string | null
  created_at: string
  updated_at: string
}

export interface BrowsePost {
  postId: string
  /** The owning Page. Its identity travels with every post. */
  groupId: string
  slug: string
  name: string
  photoUrl: string | null
  body: string
  /** Null means undated — a first-class post, not a degraded event. */
  startsAt: string | null
  locationId: string | null
  locationLabel: string | null
  /** Map pin, from the post's OWN address. Null when it has none. */
  longitude: number | null
  latitude: number | null
  createdAt: string
  updatedAt: string
  /** Attached by attachGroupPrefixes (T119); null with no resolvable Place. */
  groupSlug?: string | null
  groupPlacePath?: string | null
}

type RpcClient = Pick<SupabaseClient, 'rpc'>

/**
 * A bad point loses its pin, never the post.
 *
 * Same reasoning as the Page-grain helper: letting a decode failure throw
 * turns one malformed geography into an empty browse surface, which is a worse
 * answer to "what is near me" than a result with no pin.
 */
function pointOf(ewkb: string | null): { longitude: number | null; latitude: number | null } {
  if (!ewkb) return { longitude: null, latitude: null }
  try {
    const p = decodeEwkbPoint(ewkb)
    return { longitude: p?.longitude ?? null, latitude: p?.latitude ?? null }
  } catch {
    return { longitude: null, latitude: null }
  }
}

export async function getBrowsePosts(
  supabase: RpcClient,
  opts: {
    placeId: string
    /**
     * The cutoff past-dated posts are judged against. Omitted, the function
     * uses `now()`. Present, it is forwarded verbatim — which is what makes
     * the drop-out rule testable without waiting for a clock.
     */
    now?: string | null
    limit?: number | null
  },
): Promise<BrowsePost[]> {
  const { data, error } = await supabase.rpc('browse_posts', {
    p_place_id: opts.placeId,
    p_now: opts.now ?? null,
    p_limit: clampLimit(opts.limit),
  })
  if (error) throw error

  const mapped = ((data ?? []) as BrowsePostRow[]).map((r) => ({
    postId: r.post_id,
    groupId: r.group_id,
    slug: r.slug,
    name: r.name,
    photoUrl: r.photo_url,
    body: r.body,
    // Passed through as-is. `?? null` normalises an absent key to null without
    // ever substituting a date for one.
    startsAt: r.starts_at ?? null,
    locationId: r.location_id,
    locationLabel: r.location_label,
    ...pointOf(r.location_geography),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))

  // T119's batched URL prefixes. It keys on `groupId`, which these rows carry.
  return attachGroupPrefixes(supabase as never, mapped as never) as unknown as BrowsePost[]
}

// F093 (#215) — the signed-out read path for announcements.
//
// Who exists is public. What's happening is not. But THAT something is
// happening is public — so a signed-out reader gets a card saying which Page
// posted and how many it has this week, and is asked in to read it.
//
// WHY THIS IS A SECOND FUNCTION AND NOT A FLAG ON getBrowseFeed. `browse_feed`
// is `security invoker`, and since the F093 migration `page_posts` has no
// anonymous read — so an anonymous call to it returns zero post rows, which is
// correct and is asserted. This calls `announcements_withheld` instead, whose
// RETURN TYPE has no body, no `starts_at` and no location in it at all. The
// guarantee is the projection, not a filter applied on the way past: there is
// nothing here for a later caller to stop applying.
//
// The database half of the proof is tests/announcements-signed-out-rest.test.ts,
// which asks PostgREST with the publishable key from the bundle — the origin
// robots.txt and the firewall do not cover. A component that declines to
// render the body would be an inert guard under `[guard-proves-itself]`.

import type { SupabaseClient } from '@supabase/supabase-js'
import { announcementAnchor } from '@/components/group/announcement-anchor'
import { browseHref, type BrowseResult } from './browse-feed'
import { clampLimit } from './locality-feed'

/** One row per Page, exactly as `announcements_withheld` returns it. Read the
 *  shape as the ruling: which Page, that it posted, how many this period. */
export interface WithheldAnnouncementRow {
  result_id: string
  group_id: string
  slug: string
  name: string
  public_id: string | null
  /** Already null when hidden or removed — resolved in SQL. */
  photo_url: string | null
  announcement_count: number
  announcement_ids: string[]
  updated_at: string
}

/** Metro or place for Explore; one group so an announcement anchor resolves. */
export type WithheldScope = { metroId: string } | { placeId: string } | { groupId: string }

export interface WithheldPeriod {
  from: string
  to: string
}

export interface WithheldOpts {
  scope: WithheldScope
  /** Omitted counts every visible announcement the Page has. */
  period?: WithheldPeriod | null
  /** The cutoff past-dated announcements are judged against. */
  now?: string | null
  limit?: number | null
}

type RpcClient = Pick<SupabaseClient, 'rpc'>

/**
 * A withheld row as a browse result.
 *
 * Every field the ruling withholds is set to null EXPLICITLY here rather than
 * left off the object. The row never carried them — that is the database's
 * guarantee — and writing the nulls out is what lets one `BrowseResult` type
 * serve both surfaces, so the grid, the search and the map need to know
 * nothing about two shapes.
 */
export function mapWithheldRow(r: WithheldAnnouncementRow): BrowseResult {
  const page = browseHref(r.slug, r.public_id)
  return {
    resultKind: 'post',
    resultId: r.result_id,
    groupId: r.group_id,
    // Not projected: a Page's kind is public, but the card carries exactly
    // four things and this is not one of them.
    groupKind: '',
    slug: r.slug,
    name: r.name,
    // Criterion 9 — lands on the Page's withheld card, marked, via the latest
    // announcement's anchor. Null rather
    // than a bare fragment when the Page has no address: a link that looks
    // live and goes nowhere is worse than no link.
    href: page ? `${page}#${announcementAnchor(r.result_id)}` : null,
    photoUrl: r.photo_url,
    description: null,
    body: null,
    tags: [],
    startsAt: null,
    locationId: null,
    locationLabel: null,
    longitude: null,
    latitude: null,
    pageCreatedAt: r.updated_at,
    updatedAt: r.updated_at,
    postedAt: null,
    sortAt: r.updated_at,
    withheld: true,
    announcementCount: r.announcement_count,
    announcementIds: r.announcement_ids,
  }
}

/**
 * Read the withheld announcements for a scope.
 *
 * Throws on a read error rather than returning an empty array, the same rule
 * `getBrowseFeed` follows and for the same reason: an empty surface that means
 * "the query is broken" must not read as "nothing is happening here", which is
 * the one thing this surface exists to say.
 */
export async function getWithheldAnnouncements(
  supabase: RpcClient,
  opts: WithheldOpts,
): Promise<BrowseResult[]> {
  const { scope } = opts
  const { data, error } = await supabase.rpc('announcements_withheld', {
    p_metro_id: 'metroId' in scope ? scope.metroId : null,
    p_place_id: 'placeId' in scope ? scope.placeId : null,
    p_group_id: 'groupId' in scope ? scope.groupId : null,
    p_period_from: opts.period?.from ?? null,
    p_period_to: opts.period?.to ?? null,
    p_now: opts.now ?? null,
    p_limit: clampLimit(opts.limit),
  })
  if (error) throw error
  return ((data ?? []) as WithheldAnnouncementRow[]).map(mapWithheldRow)
}

// #962 — the Pages a member follows, shaped for the Following page (Don, 2026-10-19: "Shouldn't I be able to see
// which businesses I follow from within the app?"). Which Pages comes from the one reader, getMemberFollows
// (F065.5); this adds what a row shows. Runs as the member.

import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { visiblePhotoUrl } from '@/lib/groups/visible-photo-url'
import { loadViewerReminders } from '@/lib/reminders/viewer-reminders'

export interface FollowedPage {
  groupId: string
  href: string
  name: string
  photoUrl: string | null
  town: string | null
  nextPost: { id: string; startsAt: string; title: string } | null
  /** Series with an upcoming date: what "Remind me every time" covers. */
  repeatingSeries: string[]
  everyTimeOn: boolean
}

type Anchor = { label: string; places: { display_name: string } | null } | null

interface GroupRow {
  id: string
  public_id: string
  name: string
  photo_url: string | null
  photo_hidden_at: string | null
  photo_removed_at: string | null
  anchor: Anchor
}

interface PostRow {
  id: string
  group_id: string
  starts_at: string
  series_id: string | null
  body: string | null
}

/** The place's name, else the city in a street address ("1 K St, Davis, CA 95616"); never a guess. */
export function townOf(anchor: Anchor): string | null {
  if (!anchor) return null
  if (anchor.places?.display_name) return anchor.places.display_name
  const parts = anchor.label.split(',').map((s) => s.trim())
  return parts.length >= 3 && /^[A-Z]{2}\b/.test(parts.at(-1)!) ? parts.at(-2)! : null
}

/** Soonest upcoming post first; Pages with none after, by name. */
export function sortFollowedPages(rows: FollowedPage[]): FollowedPage[] {
  return [...rows].sort((a, b) => {
    if (a.nextPost && b.nextPost) return a.nextPost.startsAt.localeCompare(b.nextPost.startsAt)
    if (a.nextPost) return -1
    if (b.nextPost) return 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

export async function loadFollowedPages(supabase: SupabaseClient, groupIds: readonly string[], now: Date = new Date()): Promise<FollowedPage[]> {
  const ids = [...new Set(groupIds)]
  if (ids.length === 0) return []

  const [{ data: groups }, { data: posts }, reminders] = await Promise.all([
    supabase
      .from('groups')
      .select('id, public_id, name, photo_url, photo_hidden_at, photo_removed_at, anchor:locations!anchor_location_id(label, places(display_name))')
      .in('id', ids)
      .is('dissolved_at', null),
    supabase
      .from('page_posts')
      .select('id, group_id, starts_at, series_id, body')
      .in('group_id', ids)
      .gte('starts_at', now.toISOString())
      .eq('lifecycle_state', 'active')
      .is('dissolved_at', null)
      .is('hidden_at', null)
      .is('removed_at', null)
      .is('sample_kind', null)
      .order('starts_at', { ascending: true }),
    loadViewerReminders(supabase, true),
  ])

  const byGroup = new Map<string, PostRow[]>()
  for (const p of (posts ?? []) as PostRow[]) byGroup.set(p.group_id, [...(byGroup.get(p.group_id) ?? []), p])

  const rows = ((groups ?? []) as unknown as GroupRow[]).map((g): FollowedPage => {
    const upcoming = [...(byGroup.get(g.id) ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    const next = upcoming[0]
    const repeatingSeries = [...new Set(upcoming.flatMap((p) => (p.series_id ? [p.series_id] : [])))]
    return {
      groupId: g.id,
      href: canonicalPagePath(g.public_id),
      name: g.name,
      photoUrl: visiblePhotoUrl(g),
      town: townOf(g.anchor),
      nextPost: next ? { id: next.id, startsAt: next.starts_at, title: (next.body ?? '').split('\n')[0].trim() } : null,
      repeatingSeries,
      everyTimeOn: repeatingSeries.length > 0 && repeatingSeries.every((s) => reminders.bySeries[s]),
    }
  })
  return sortFollowedPages(rows)
}


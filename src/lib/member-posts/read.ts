// #1183 — reading posts from members: one database function, signed-in readers only (member_posts_read). It
// returns display name, avatar and neighborhood, never a member id or a member's own area.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrowseScope } from '@/lib/feed/browse-feed'
import type { MemberPostKind } from './kinds'

export interface MemberPost {
  id: string
  kind: MemberPostKind
  body: string
  placeName: string
  saleOn: string | null
  /** A yard sale's street, until its day is over. */
  street: string | null
  createdAt: string
  expiresAt: string
  labels: string[]
  labelsPinned: boolean
  displayName: string
  avatarUrl: string | null
  mine: boolean
  /** Taken down, hidden or expired: only its poster still reads it. */
  ended: boolean
  answered: boolean
  /** Who answered, for the poster only. */
  answers: { displayName: string; at: string }[] | null
}

type Args = { scope?: BrowseScope; postId?: string; search?: string; limit?: number }

export async function readMemberPosts(supabase: SupabaseClient, { scope, postId, search, limit }: Args): Promise<MemberPost[]> {
  const { data, error } = await supabase.rpc('member_posts_read', {
    p_metro_id: scope && 'metroId' in scope ? scope.metroId : null,
    p_place_id: scope && 'placeId' in scope ? scope.placeId : null,
    p_post_id: postId ?? null,
    p_search: search?.trim() || null,
    p_limit: limit ?? 30,
  })
  if (error) throw new Error(`member_posts_read: ${error.message}`)
  return (data ?? []) as MemberPost[]
}

/** Live posts by kind, newest first: Explore's rows. */
export function byKind(posts: readonly MemberPost[]): Map<MemberPostKind, MemberPost[]> {
  const out = new Map<MemberPostKind, MemberPost[]>()
  for (const p of posts) out.set(p.kind, [...(out.get(p.kind) ?? []), p])
  return out
}

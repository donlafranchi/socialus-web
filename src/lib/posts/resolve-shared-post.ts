// A shared post's address (Don, 2026-10-31). It answers only what its reader could already read on the Page: signed
// in, the post as RLS returns it; signed out, the withheld form (F093) with the post's headline, lead-line fields and
// photo (Don, B, #1126), read through shared_post_preview, whose return type has no body. Anything else is no post.

import type { SupabaseClient } from '@supabase/supabase-js'
import { viewerId } from '@/lib/auth/viewer'
import { resolvePagePosts, type PagePost } from '@/lib/groups/page-posts'
import type { ResolvedShop } from '@/lib/groups/resolve-shop'
import { maskEmailsOrNull } from '@/lib/text/contact-info'
import { isPostId } from './post-path'
import { isPostKind, type PostKind } from './kinds'

export interface PostPreview {
  id: string
  kind: PostKind
  headline: string | null
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  locationLabel: string | null
  photoUrl: string | null
  sampleKind: string | null
}

export type SharedPost = { access: 'full'; post: PagePost } | { access: 'withheld'; preview: PostPreview }

interface PreviewRow {
  id: string
  kind: string
  headline: string | null
  starts_at: string | null
  ends_at: string | null
  created_at: string
  location_label: string | null
  photo_url: string | null
  sample_kind: string | null
}

export async function resolveSharedPost(supabase: SupabaseClient, shop: Pick<ResolvedShop, 'groupId'>, postId: string): Promise<SharedPost | null> {
  if (!isPostId(postId)) return null
  if (await viewerId(supabase)) {
    const [post] = await resolvePagePosts(supabase, shop.groupId, undefined, { postId })
    return post ? { access: 'full', post } : null
  }
  const { data, error } = await supabase.rpc('shared_post_preview', { p_group_id: shop.groupId, p_post_id: postId })
  const r = !error ? ((data ?? []) as PreviewRow[])[0] : undefined
  if (!r) return null
  return {
    access: 'withheld',
    preview: {
      id: r.id,
      kind: isPostKind(r.kind) ? r.kind : 'news',
      headline: maskEmailsOrNull(r.headline),
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      createdAt: r.created_at,
      locationLabel: r.location_label,
      photoUrl: r.photo_url,
      sampleKind: r.sample_kind,
    },
  }
}

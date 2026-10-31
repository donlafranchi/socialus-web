// A shared post's address (Don, 2026-10-31). It answers only what its reader could already read on the Page: signed
// in, the post as RLS returns it; signed out, the withheld form (F093) when the post is one of the Page's visible
// ones, read through the projection that carries no words. Anything else is no post.

import type { SupabaseClient } from '@supabase/supabase-js'
import { viewerId } from '@/lib/auth/viewer'
import { resolvePagePosts, type PagePost } from '@/lib/groups/page-posts'
import { getWithheldAnnouncements } from '@/lib/feed/withheld-announcements'
import type { ResolvedShop } from '@/lib/groups/resolve-shop'
import { isPostId } from './post-path'

export type SharedPost = { access: 'full'; post: PagePost } | { access: 'withheld' }

export async function resolveSharedPost(supabase: SupabaseClient, shop: Pick<ResolvedShop, 'groupId'>, postId: string): Promise<SharedPost | null> {
  if (!isPostId(postId)) return null
  if (await viewerId(supabase)) {
    const [post] = await resolvePagePosts(supabase, shop.groupId, undefined, { postId })
    return post ? { access: 'full', post } : null
  }
  const rows = await getWithheldAnnouncements(supabase, { scope: { groupId: shop.groupId } }).catch(() => [])
  return rows.some((r) => r.announcementIds?.includes(postId)) ? { access: 'withheld' } : null
}
